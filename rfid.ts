namespace bnet {
    const R_NSS = DigitalPin.P16
    const R_RST = DigitalPin.P8

    const CommandReg = 0x01, ComIrqReg = 0x04, DivIrqReg = 0x05
    const ErrorReg = 0x06, Status2Reg = 0x08, FIFODataReg = 0x09
    const FIFOLevelReg = 0x0A, ControlReg = 0x0C, BitFramingReg = 0x0D
    const ModeReg = 0x11, TxControlReg = 0x14, TxAutoReg = 0x15
    const CRCResultL = 0x22, CRCResultH = 0x21
    const TModeReg = 0x2A, TPrescalerReg = 0x2B
    const TReloadH = 0x2C, TReloadL = 0x2D

    const PCD_IDLE = 0x00, PCD_CALCCRC = 0x03, PCD_TRANSCEIVE = 0x0C
    const PCD_AUTHENT = 0x0E, PCD_SOFTRESET = 0x0F
    const PICC_REQIDL = 0x26, PICC_ANTICOLL = 0x93, PICC_SELECT = 0x93
    const PICC_AUTH_KA = 0x60, PICC_READ = 0x30, PICC_WRITE = 0xA0
    const MI_OK = 0, MI_ERR = 2
    const BLOCK_ADDR = 1
    const KEY_A = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]

    let rfidStarted = false
    let lastValue = -1

    function wReg(a: number, v: number) {
        pins.digitalWritePin(R_NSS, 0)
        pins.spiWrite((a << 1) & 0x7E); pins.spiWrite(v & 0xFF)
        pins.digitalWritePin(R_NSS, 1)
    }
    function rReg(a: number) {
        pins.digitalWritePin(R_NSS, 0)
        pins.spiWrite(((a << 1) & 0x7E) | 0x80)
        let v = pins.spiWrite(0x00)
        pins.digitalWritePin(R_NSS, 1)
        return v & 0xFF
    }
    function setB(a: number, m: number) { wReg(a, rReg(a) | m) }
    function clrB(a: number, m: number) { wReg(a, rReg(a) & (~m & 0xFF)) }

    function toCard(cmd: number, send: number[]) {
        let back: number[] = [], bits = 0, status = MI_ERR
        let wait = (cmd == PCD_AUTHENT) ? 0x10 : 0x30
        wReg(0x02, 0x77 | 0x80); clrB(ComIrqReg, 0x80)
        setB(FIFOLevelReg, 0x80); wReg(CommandReg, PCD_IDLE)
        for (let i = 0; i < send.length; i++) wReg(FIFODataReg, send[i] & 0xFF)
        wReg(CommandReg, cmd)
        if (cmd == PCD_TRANSCEIVE) setB(BitFramingReg, 0x80)
        let i = 2000, n = 0
        do { n = rReg(ComIrqReg); i-- } while ((i != 0) && !(n & 0x01) && !(n & wait))
        clrB(BitFramingReg, 0x80)
        if (i != 0 && (rReg(ErrorReg) & 0x1B) == 0x00) {
            status = MI_OK
            if (cmd == PCD_TRANSCEIVE) {
                let f = rReg(FIFOLevelReg), lb = rReg(ControlReg) & 0x07
                bits = (lb != 0) ? (f - 1) * 8 + lb : f * 8
                if (f == 0) f = 1; if (f > 16) f = 16
                for (let j = 0; j < f; j++) back.push(rReg(FIFODataReg))
            }
        }
        return { status: status, back: back, bits: bits }
    }

    function crc(data: number[]) {
        clrB(DivIrqReg, 0x04); setB(FIFOLevelReg, 0x80)
        for (let i = 0; i < data.length; i++) wReg(FIFODataReg, data[i] & 0xFF)
        wReg(CommandReg, PCD_CALCCRC)
        let i = 0xFF; while (i-- > 0) { if (rReg(DivIrqReg) & 0x04) break }
        return [rReg(CRCResultL), rReg(CRCResultH)]
    }

    function req(): boolean {
        wReg(BitFramingReg, 0x07)
        let r = toCard(PCD_TRANSCEIVE, [PICC_REQIDL])
        return (r.status == MI_OK && r.bits == 0x10)
    }
    function anti(): number[] {
        wReg(BitFramingReg, 0x00)
        let r = toCard(PCD_TRANSCEIVE, [PICC_ANTICOLL, 0x20])
        if (r.status != MI_OK || r.back.length != 5) return []
        let c = 0; for (let i = 0; i < 4; i++) c ^= r.back[i]
        return (c == r.back[4]) ? r.back : []
    }
    function sel(uid: number[]): boolean {
        let b = [PICC_SELECT, 0x70]
        for (let i = 0; i < 5; i++) b.push(uid[i])
        let c = crc(b); b.push(c[0]); b.push(c[1])
        let r = toCard(PCD_TRANSCEIVE, b)
        return (r.status == MI_OK && r.bits == 0x18)
    }
    function auth(block: number, uid: number[]): boolean {
        let b = [PICC_AUTH_KA, block]
        for (let i = 0; i < 6; i++) b.push(KEY_A[i])
        for (let i = 0; i < 4; i++) b.push(uid[i])
        let r = toCard(PCD_AUTHENT, b)
        return (r.status == MI_OK && (rReg(Status2Reg) & 0x08) != 0)
    }
    function haltCrypto() { clrB(Status2Reg, 0x08) }

    function readBlk(block: number): number[] {
        let b = [PICC_READ, block]
        let c = crc(b); b.push(c[0]); b.push(c[1])
        let r = toCard(PCD_TRANSCEIVE, b)
        return (r.status == MI_OK && r.back.length == 16) ? r.back : []
    }
    function writeBlk(block: number, d16: number[]): boolean {
        let b = [PICC_WRITE, block]
        let c = crc(b); b.push(c[0]); b.push(c[1])
        let r = toCard(PCD_TRANSCEIVE, b)
        if (r.status != MI_OK || r.bits != 4 || (r.back[0] & 0x0F) != 0x0A) return false
        let d = d16.slice(); while (d.length < 16) d.push(0)
        let c2 = crc(d); d.push(c2[0]); d.push(c2[1])
        let r2 = toCard(PCD_TRANSCEIVE, d)
        return (r2.status == MI_OK && r2.bits == 4 && (r2.back[0] & 0x0F) == 0x0A)
    }

    /**
     * Start the RFID reader (RC522). Put this in "on start".
     * Wiring (micro:bit -> RC522):
     * SDA/SS -> P16, SCK -> P13, MOSI -> P15,
     * MISO -> P14, RST -> P8, 3.3V -> 3V, GND -> GND
     */
    //% block="setup RFID (SS=P16 SCK=P13 MOSI=P15 MISO=P14 RST=P8)"
    //% subcategory="RFID" weight=100
    export function setup(): void {
        pins.digitalWritePin(R_RST, 0); basic.pause(50)
        pins.digitalWritePin(R_RST, 1); basic.pause(50)
        pins.spiPins(DigitalPin.P14, DigitalPin.P15, DigitalPin.P13)
        pins.spiFormat(8, 0); pins.spiFrequency(1000000)
        pins.digitalWritePin(R_NSS, 1)
        wReg(CommandReg, PCD_SOFTRESET); basic.pause(50)
        wReg(TModeReg, 0x8D); wReg(TPrescalerReg, 0x3E)
        wReg(TReloadL, 30); wReg(TReloadH, 0)
        wReg(TxAutoReg, 0x40); wReg(ModeReg, 0x3D)
        setB(TxControlReg, 0x03)
        rfidStarted = true
    }

    /**
     * Write a number (0 to 255) to the tapped card.
     */
    //% block="write %value to card"
    //% value.min=0 value.max=255 value.defl=1
    //% subcategory="RFID" weight=80
    export function write(value: number): boolean {
        if (!rfidStarted) setup()
        if (!req()) return false
        let uid = anti(); if (uid.length == 0) return false
        if (!sel(uid)) return false
        if (!auth(BLOCK_ADDR, uid)) { haltCrypto(); return false }
        let d = [value & 0xFF]; for (let i = 1; i < 16; i++) d.push(0)
        let ok = writeBlk(BLOCK_ADDR, d); haltCrypto()
        return ok
    }

    /**
     * Run code when a card is tapped. "value" is the number on the card.
     */
    //% block="on card scanned"
    //% draggableParameters=reporter
    //% subcategory="RFID" weight=90
    export function onCard(handler: (value: number) => void): void {
        if (!rfidStarted) setup()
        control.inBackground(function () {
            while (true) {
                if (req()) {
                    let uid = anti()
                    if (uid.length != 0 && sel(uid) && auth(BLOCK_ADDR, uid)) {
                        let d = readBlk(BLOCK_ADDR); haltCrypto()
                        if (d.length == 16) {
                            let v = d[0]
                            if (v != lastValue) {
                                lastValue = v
                                handler(v)
                            }
                        }
                    } else { haltCrypto() }
                } else {
                    lastValue = -1
                }
                basic.pause(200)
            }
        })
    }
}

namespace bnet {
    const TOF_ADDR = 0x29
    const TOF_IO_TIMEOUT = 1000

    let tofStarted = false
    let stop_variable = 0
    let spad_count = 0
    let is_aperture = false
    let spad_map: number[] = [0, 0, 0, 0, 0, 0]
    let latestMm = 8190

    function tReadReg(raddr: number): number {
        pins.i2cWriteNumber(TOF_ADDR, raddr, NumberFormat.UInt8BE, false)
        return pins.i2cReadNumber(TOF_ADDR, NumberFormat.UInt8BE, false)
    }
    function tReadReg16(raddr: number): number {
        pins.i2cWriteNumber(TOF_ADDR, raddr, NumberFormat.UInt8BE, false)
        return pins.i2cReadNumber(TOF_ADDR, NumberFormat.UInt16BE, false)
    }
    function tWriteReg(raddr: number, d: number): void {
        pins.i2cWriteNumber(TOF_ADDR, ((raddr << 8) + d), NumberFormat.UInt16BE, false)
    }
    function tWriteReg16(raddr: number, d: number): void {
        pins.i2cWriteNumber(TOF_ADDR, raddr, NumberFormat.UInt8BE, false)
        pins.i2cWriteNumber(TOF_ADDR, d, NumberFormat.UInt16BE, false)
    }
    function tWriteFlag(register: number, bit: number, onflag: boolean): void {
        let data = tReadReg(register)
        let mask = 1 << bit
        if (onflag) data |= mask
        else data &= ~mask
        tWriteReg(register, data)
    }

    function spad_info(): boolean {
        tWriteReg(0x80, 0x01)
        tWriteReg(0xff, 0x01)
        tWriteReg(0x00, 0x00)
        tWriteReg(0xff, 0x06)
        tWriteFlag(0x83, 3, true)
        tWriteReg(0xff, 0x07)
        tWriteReg(0x81, 0x01)
        tWriteReg(0x80, 0x01)
        tWriteReg(0x94, 0x6b)
        tWriteReg(0x83, 0x00)
        let t = 0
        while (tReadReg(0x83) == 0) {
            t++; basic.pause(1)
            if (t == TOF_IO_TIMEOUT) return false
        }
        tWriteReg(0x83, 0x01)
        let value = tReadReg(0x92)
        tWriteReg(0x81, 0x00)
        tWriteReg(0xff, 0x06)
        tWriteFlag(0x83, 3, false)
        tWriteReg(0xff, 0x01)
        tWriteReg(0x00, 0x01)
        tWriteReg(0xff, 0x00)
        tWriteReg(0x80, 0x00)
        spad_count = value & 0x7f
        is_aperture = ((value & 0x80) == 0x80)
        return true
    }

    function calibrate(val: number): boolean {
        tWriteReg(0x00, 0x01 | val)
        let t = 0
        while ((tReadReg(0x13) & 0x07) == 0) {
            t++; basic.pause(1)
            if (t == TOF_IO_TIMEOUT) return false
        }
        tWriteReg(0x0b, 0x01)
        tWriteReg(0x00, 0x00)
        return true
    }

    function fullInit(): boolean {
        if (tReadReg(0xc0) != 0xEE) return false
        if (tReadReg(0xc1) != 0xAA) return false
        if (tReadReg(0xc2) != 0x10) return false

        tWriteFlag(0x89, 0, true)
        tWriteReg(0x88, 0x00)
        tWriteReg(0x80, 0x01)
        tWriteReg(0xff, 0x01)
        tWriteReg(0x00, 0x00)
        stop_variable = tReadReg(0x91)
        tWriteReg(0x00, 0x01)
        tWriteReg(0xff, 0x00)
        tWriteReg(0x80, 0x00)

        tWriteFlag(0x60, 1, true)
        tWriteFlag(0x60, 4, true)
        tWriteReg16(0x44, Math.floor(0.25 * (1 << 7)))
        tWriteReg(0x01, 0xff)

        if (!spad_info()) return false

        pins.i2cWriteNumber(TOF_ADDR, 0xb0, NumberFormat.UInt8BE, false)
        let sp1 = pins.i2cReadNumber(TOF_ADDR, NumberFormat.UInt16BE, false)
        let sp2 = pins.i2cReadNumber(TOF_ADDR, NumberFormat.UInt16BE, false)
        let sp3 = pins.i2cReadNumber(TOF_ADDR, NumberFormat.UInt16BE, false)
        spad_map[0] = (sp1 >> 8) & 0xFF
        spad_map[1] = sp1 & 0xFF
        spad_map[2] = (sp2 >> 8) & 0xFF
        spad_map[3] = sp2 & 0xFF
        spad_map[4] = (sp3 >> 8) & 0xFF
        spad_map[5] = sp3 & 0xFF

        tWriteReg(0xff, 0x01)
        tWriteReg(0x4f, 0x00)
        tWriteReg(0x4e, 0x2c)
        tWriteReg(0xff, 0x00)
        tWriteReg(0xb6, 0xb4)

        let spads_enabled = 0
        for (let i = 0; i < 48; i++) {
            if ((i < 12 && is_aperture) || (spads_enabled >= spad_count)) {
                spad_map[i >> 3] &= ~(1 << (i >> 2))
            } else if (spad_map[i >> 3] & (1 << (i >> 2))) {
                spads_enabled += 1
            }
        }

        tWriteReg(0xff, 0x01); tWriteReg(0x00, 0x00)
        tWriteReg(0xff, 0x00); tWriteReg(0x09, 0x00)
        tWriteReg(0x10, 0x00); tWriteReg(0x11, 0x00)
        tWriteReg(0x24, 0x01); tWriteReg(0x25, 0xFF); tWriteReg(0x75, 0x00)
        tWriteReg(0xFF, 0x01); tWriteReg(0x4E, 0x2C); tWriteReg(0x48, 0x00); tWriteReg(0x30, 0x20)
        tWriteReg(0xFF, 0x00); tWriteReg(0x30, 0x09); tWriteReg(0x54, 0x00)
        tWriteReg(0x31, 0x04); tWriteReg(0x32, 0x03); tWriteReg(0x40, 0x83)
        tWriteReg(0x46, 0x25); tWriteReg(0x60, 0x00); tWriteReg(0x27, 0x00)
        tWriteReg(0x50, 0x06); tWriteReg(0x51, 0x00); tWriteReg(0x52, 0x96)
        tWriteReg(0x56, 0x08); tWriteReg(0x57, 0x30); tWriteReg(0x61, 0x00)
        tWriteReg(0x62, 0x00); tWriteReg(0x64, 0x00); tWriteReg(0x65, 0x00); tWriteReg(0x66, 0xA0)
        tWriteReg(0xFF, 0x01); tWriteReg(0x22, 0x32); tWriteReg(0x47, 0x14)
        tWriteReg(0x49, 0xFF); tWriteReg(0x4A, 0x00)
        tWriteReg(0xFF, 0x00); tWriteReg(0x7A, 0x0A); tWriteReg(0x7B, 0x00); tWriteReg(0x78, 0x21)
        tWriteReg(0xFF, 0x01); tWriteReg(0x23, 0x34); tWriteReg(0x42, 0x00)
        tWriteReg(0x44, 0xFF); tWriteReg(0x45, 0x26); tWriteReg(0x46, 0x05)
        tWriteReg(0x40, 0x40); tWriteReg(0x0E, 0x06); tWriteReg(0x20, 0x1A); tWriteReg(0x43, 0x40)
        tWriteReg(0xFF, 0x00); tWriteReg(0x34, 0x03); tWriteReg(0x35, 0x44)
        tWriteReg(0xFF, 0x01); tWriteReg(0x31, 0x04); tWriteReg(0x4B, 0x09)
        tWriteReg(0x4C, 0x05); tWriteReg(0x4D, 0x04)
        tWriteReg(0xFF, 0x00); tWriteReg(0x44, 0x00); tWriteReg(0x45, 0x20)
        tWriteReg(0x47, 0x08); tWriteReg(0x48, 0x28); tWriteReg(0x67, 0x00)
        tWriteReg(0x70, 0x04); tWriteReg(0x71, 0x01); tWriteReg(0x72, 0xFE)
        tWriteReg(0x76, 0x00); tWriteReg(0x77, 0x00)
        tWriteReg(0xFF, 0x01); tWriteReg(0x0D, 0x01)
        tWriteReg(0xFF, 0x00); tWriteReg(0x80, 0x01); tWriteReg(0x01, 0xF8)
        tWriteReg(0xFF, 0x01); tWriteReg(0x8E, 0x01); tWriteReg(0x00, 0x01)
        tWriteReg(0xFF, 0x00); tWriteReg(0x80, 0x00)

        tWriteReg(0x0a, 0x04)
        tWriteFlag(0x84, 4, false)
        tWriteReg(0x0b, 0x01)

        tWriteReg(0x01, 0x01)
        if (!calibrate(0x40)) return false
        tWriteReg(0x01, 0x02)
        if (!calibrate(0x00)) return false
        tWriteReg(0x01, 0xe8)

        tWriteReg(0x80, 0x01)
        tWriteReg(0xFF, 0x01)
        tWriteReg(0x00, 0x00)
        tWriteReg(0x91, stop_variable)
        tWriteReg(0x00, 0x01)
        tWriteReg(0xFF, 0x00)
        tWriteReg(0x80, 0x00)
        tWriteReg(0x00, 0x02)
        return true
    }

    /**
     * Initialise the TOF sensor (VL53L0X). Put this in "on start".
     * Wiring: SDA -> P20, SCL -> P19, VIN -> 3V, GND -> GND
     */
    //% block="init TOF sensor"
    //% subcategory="TOF" weight=100
    export function init(): void {
        if (tofStarted) return
        basic.pause(1200)
        if (!fullInit()) {
            basic.pause(500)
            if (!fullInit()) return
        }
        tofStarted = true
        control.inBackground(function () {
            while (true) {
                if ((tReadReg(0x13) & 0x07) != 0) {
                    let d = tReadReg16(0x14 + 10)
                    tWriteReg(0x0b, 0x01)
                    if (d > 0 && d < 8000) latestMm = d
                }
                basic.pause(5)
            }
        })
    }

    /**
     * Latest distance measured, in millimetres.
     */
    //% block="distance (mm)"
    //% subcategory="TOF" weight=90
    export function distance(): number {
        if (!tofStarted) init()
        return latestMm
    }

    /**
     * True if something is closer than the given distance (mm).
     */
    //% block="object closer than %mm mm"
    //% mm.min=20 mm.max=2000 mm.defl=100
    //% subcategory="TOF" weight=80
    export function closerThan(mm: number): boolean {
        if (!tofStarted) init()
        return latestMm < mm
    }
}

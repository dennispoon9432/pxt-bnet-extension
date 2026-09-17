//% color=#0288D1 icon="\uf161" block="TOF"
namespace tof {
    const ADDR = 0x29
    const IO_TIMEOUT = 1000

    let started = false
    let stop_variable = 0
    let spad_count = 0
    let is_aperture = false
    let spad_map: number[] = [0, 0, 0, 0, 0, 0]
    let latestMm = 8190

    // ---------- I2C helpers ----------
    function readReg(raddr: number): number {
        pins.i2cWriteNumber(ADDR, raddr, NumberFormat.UInt8BE, false)
        return pins.i2cReadNumber(ADDR, NumberFormat.UInt8BE, false)
    }
    function readReg16(raddr: number): number {
        pins.i2cWriteNumber(ADDR, raddr, NumberFormat.UInt8BE, false)
        return pins.i2cReadNumber(ADDR, NumberFormat.UInt16BE, false)
    }
    function writeReg(raddr: number, d: number): void {
        pins.i2cWriteNumber(ADDR, ((raddr << 8) + d), NumberFormat.UInt16BE, false)
    }
    function writeReg16(raddr: number, d: number): void {
        pins.i2cWriteNumber(ADDR, raddr, NumberFormat.UInt8BE, false)
        pins.i2cWriteNumber(ADDR, d, NumberFormat.UInt16BE, false)
    }
    function writeFlag(register: number, bit: number, onflag: boolean): void {
        let data = readReg(register)
        let mask = 1 << bit
        if (onflag) data |= mask
        else data &= ~mask
        writeReg(register, data)
    }

    // ---------- SPAD info ----------
    function spad_info(): boolean {
        writeReg(0x80, 0x01)
        writeReg(0xff, 0x01)
        writeReg(0x00, 0x00)
        writeReg(0xff, 0x06)
        writeFlag(0x83, 3, true)
        writeReg(0xff, 0x07)
        writeReg(0x81, 0x01)
        writeReg(0x80, 0x01)
        writeReg(0x94, 0x6b)
        writeReg(0x83, 0x00)

        let t = 0
        while (readReg(0x83) == 0) {
            t++; basic.pause(1)
            if (t == IO_TIMEOUT) return false
        }

        writeReg(0x83, 0x01)
        let value = readReg(0x92)
        writeReg(0x81, 0x00)
        writeReg(0xff, 0x06)
        writeFlag(0x83, 3, false)
        writeReg(0xff, 0x01)
        writeReg(0x00, 0x01)
        writeReg(0xff, 0x00)
        writeReg(0x80, 0x00)

        spad_count = value & 0x7f
        is_aperture = ((value & 0x80) == 0x80)
        return true
    }

    // ---------- Reference calibration ----------
    function calibrate(val: number): boolean {
        writeReg(0x00, 0x01 | val)
        let t = 0
        while ((readReg(0x13) & 0x07) == 0) {
            t++; basic.pause(1)
            if (t == IO_TIMEOUT) return false
        }
        writeReg(0x0b, 0x01)
        writeReg(0x00, 0x00)
        return true
    }

    // ---------- Full init (based on ST reference / GitHub lib) ----------
    function fullInit(): boolean {
        // Verify device
        if (readReg(0xc0) != 0xEE) return false
        if (readReg(0xc1) != 0xAA) return false
        if (readReg(0xc2) != 0x10) return false

        // 2v8 mode
        writeFlag(0x89, 0, true)

        // I2C standard mode
        writeReg(0x88, 0x00)
        writeReg(0x80, 0x01)
        writeReg(0xff, 0x01)
        writeReg(0x00, 0x00)
        stop_variable = readReg(0x91)
        writeReg(0x00, 0x01)
        writeReg(0xff, 0x00)
        writeReg(0x80, 0x00)

        // Disable MSRC/pre-range signal rate checks
        writeFlag(0x60, 1, true)
        writeFlag(0x60, 4, true)

        // Signal rate limit 0.25 MCPS
        writeReg16(0x44, Math.floor(0.25 * (1 << 7)))

        writeReg(0x01, 0xff)

        if (!spad_info()) return false

        // Read reference SPAD map
        pins.i2cWriteNumber(ADDR, 0xb0, NumberFormat.UInt8BE, false)
        let sp1 = pins.i2cReadNumber(ADDR, NumberFormat.UInt16BE, false)
        let sp2 = pins.i2cReadNumber(ADDR, NumberFormat.UInt16BE, false)
        let sp3 = pins.i2cReadNumber(ADDR, NumberFormat.UInt16BE, false)
        spad_map[0] = (sp1 >> 8) & 0xFF
        spad_map[1] = sp1 & 0xFF
        spad_map[2] = (sp2 >> 8) & 0xFF
        spad_map[3] = sp2 & 0xFF
        spad_map[4] = (sp3 >> 8) & 0xFF
        spad_map[5] = sp3 & 0xFF

        // Set reference SPADs
        writeReg(0xff, 0x01)
        writeReg(0x4f, 0x00)
        writeReg(0x4e, 0x2c)
        writeReg(0xff, 0x00)
        writeReg(0xb6, 0xb4)

        let spads_enabled = 0
        for (let i = 0; i < 48; i++) {
            if ((i < 12 && is_aperture) || (spads_enabled >= spad_count)) {
                spad_map[i >> 3] &= ~(1 << (i >> 2))
            } else if (spad_map[i >> 3] & (1 << (i >> 2))) {
                spads_enabled += 1
            }
        }

        // ---- ST recommended tuning settings ----
        writeReg(0xff, 0x01); writeReg(0x00, 0x00)
        writeReg(0xff, 0x00); writeReg(0x09, 0x00)
        writeReg(0x10, 0x00); writeReg(0x11, 0x00)
        writeReg(0x24, 0x01); writeReg(0x25, 0xFF); writeReg(0x75, 0x00)
        writeReg(0xFF, 0x01); writeReg(0x4E, 0x2C); writeReg(0x48, 0x00); writeReg(0x30, 0x20)
        writeReg(0xFF, 0x00); writeReg(0x30, 0x09); writeReg(0x54, 0x00)
        writeReg(0x31, 0x04); writeReg(0x32, 0x03); writeReg(0x40, 0x83)
        writeReg(0x46, 0x25); writeReg(0x60, 0x00); writeReg(0x27, 0x00)
        writeReg(0x50, 0x06); writeReg(0x51, 0x00); writeReg(0x52, 0x96)
        writeReg(0x56, 0x08); writeReg(0x57, 0x30); writeReg(0x61, 0x00)
        writeReg(0x62, 0x00); writeReg(0x64, 0x00); writeReg(0x65, 0x00); writeReg(0x66, 0xA0)
        writeReg(0xFF, 0x01); writeReg(0x22, 0x32); writeReg(0x47, 0x14)
        writeReg(0x49, 0xFF); writeReg(0x4A, 0x00)
        writeReg(0xFF, 0x00); writeReg(0x7A, 0x0A); writeReg(0x7B, 0x00); writeReg(0x78, 0x21)
        writeReg(0xFF, 0x01); writeReg(0x23, 0x34); writeReg(0x42, 0x00)
        writeReg(0x44, 0xFF); writeReg(0x45, 0x26); writeReg(0x46, 0x05)
        writeReg(0x40, 0x40); writeReg(0x0E, 0x06); writeReg(0x20, 0x1A); writeReg(0x43, 0x40)
        writeReg(0xFF, 0x00); writeReg(0x34, 0x03); writeReg(0x35, 0x44)
        writeReg(0xFF, 0x01); writeReg(0x31, 0x04); writeReg(0x4B, 0x09)
        writeReg(0x4C, 0x05); writeReg(0x4D, 0x04)
        writeReg(0xFF, 0x00); writeReg(0x44, 0x00); writeReg(0x45, 0x20)
        writeReg(0x47, 0x08); writeReg(0x48, 0x28); writeReg(0x67, 0x00)
        writeReg(0x70, 0x04); writeReg(0x71, 0x01); writeReg(0x72, 0xFE)
        writeReg(0x76, 0x00); writeReg(0x77, 0x00)
        writeReg(0xFF, 0x01); writeReg(0x0D, 0x01)
        writeReg(0xFF, 0x00); writeReg(0x80, 0x01); writeReg(0x01, 0xF8)
        writeReg(0xFF, 0x01); writeReg(0x8E, 0x01); writeReg(0x00, 0x01)
        writeReg(0xFF, 0x00); writeReg(0x80, 0x00)

        // Interrupt config
        writeReg(0x0a, 0x04)
        writeFlag(0x84, 4, false)
        writeReg(0x0b, 0x01)

        // Reference calibration (CRITICAL for cold boot)
        writeReg(0x01, 0x01)
        if (!calibrate(0x40)) return false
        writeReg(0x01, 0x02)
        if (!calibrate(0x00)) return false
        writeReg(0x01, 0xe8)

        // Start continuous back-to-back ranging
        writeReg(0x80, 0x01)
        writeReg(0xFF, 0x01)
        writeReg(0x00, 0x00)
        writeReg(0x91, stop_variable)
        writeReg(0x00, 0x01)
        writeReg(0xFF, 0x00)
        writeReg(0x80, 0x00)
        writeReg(0x00, 0x02)

        return true
    }

    /**
     * Initialise the TOF sensor. Put this in "on start".
     */
    //% block="init TOF sensor"
    //% weight=100
    export function init(): void {
        if (started) return
        basic.pause(1200)   // wait for VL53L0X boot after power-on
        if (!fullInit()) {
            // Retry once after another delay (cold-boot safety)
            basic.pause(500)
            if (!fullInit()) return
        }
        started = true

        control.inBackground(function () {
            while (true) {
                if ((readReg(0x13) & 0x07) != 0) {
                    let d = readReg16(0x14 + 10)
                    writeReg(0x0b, 0x01)
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
    //% weight=90
    export function distance(): number {
        if (!started) init()
        return latestMm
    }

    /**
     * True if something is closer than the given distance (mm).
     */
    //% block="object closer than %mm mm"
    //% mm.min=20 mm.max=2000 mm.defl=100
    //% weight=80
    export function closerThan(mm: number): boolean {
        if (!started) init()
        return latestMm < mm
    }
}

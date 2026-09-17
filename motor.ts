//% color=#3838C1 icon="\uf085" block="BNET" weight=100
//% subcategories='["Motor", "TOF", "RFID"]'
namespace bnet {

    let pinA: AnalogPin = AnalogPin.P0;
    let pinB: AnalogPin = AnalogPin.P1;

    export enum Direction {
        //% block="forward"
        Forward = 0,
        //% block="backward"
        Backward = 1
    }

    /**
     * Set the pins connected to INA and INB of the motor module.
     */
    //% blockId=bnet_motor_set_pins
    //% block="set motor pins INA %a INB %b"
    //% a.defl=AnalogPin.P0 b.defl=AnalogPin.P1
    //% subcategory="Motor" weight=100
    export function setPins(a: AnalogPin, b: AnalogPin): void {
        pinA = a; pinB = b;
        pins.analogWritePin(pinA, 0);
        pins.analogWritePin(pinB, 0);
    }

    /**
     * Rotate the motor at a given speed and direction.
     */
    //% blockId=bnet_motor_rotate
    //% block="rotate motor speed %speed \\% direction %dir"
    //% speed.min=0 speed.max=100 speed.defl=50
    //% subcategory="Motor" weight=90
    export function rotate(speed: number, dir: Direction): void {
        if (speed < 0) speed = 0;
        if (speed > 100) speed = 100;
        let pwm = Math.map(speed, 0, 100, 0, 1023);
        if (dir == Direction.Forward) {
            pins.analogWritePin(pinB, 0);
            pins.analogWritePin(pinA, pwm);
        } else {
            pins.analogWritePin(pinA, 0);
            pins.analogWritePin(pinB, pwm);
        }
    }

    /**
     * Stop the motor immediately.
     */
    //% blockId=bnet_motor_stop
    //% block="stop motor"
    //% subcategory="Motor" weight=80
    export function stop(): void {
        pins.analogWritePin(pinA, 0);
        pins.analogWritePin(pinB, 0);
    }
}

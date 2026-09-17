/**
 * Motor Module control using INA and INB pins.
 */
//% color="#ff6600" weight=100 icon="\uf085" block="Motor"
namespace motorModule {

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
     * @param a pin connected to INA
     * @param b pin connected to INB
     */
    //% blockId=motor_set_pins
    //% block="set motor pins INA %a INB %b"
    //% a.defl=AnalogPin.P0
    //% b.defl=AnalogPin.P1
    //% weight=100
    export function setPins(a: AnalogPin, b: AnalogPin): void {
        pinA = a;
        pinB = b;
        pins.analogWritePin(pinA, 0);
        pins.analogWritePin(pinB, 0);
    }

    /**
     * Rotate the motor at a given speed and direction.
     * @param speed motor speed 0 - 100 (%), eg: 50
     * @param dir direction to rotate
     */
    //% blockId=motor_rotate
    //% block="rotate motor speed %speed \\% direction %dir"
    //% speed.min=0 speed.max=100
    //% speed.defl=50
    //% weight=90
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
    //% blockId=motor_stop
    //% block="stop motor"
    //% weight=80
    export function stop(): void {
        pins.analogWritePin(pinA, 0);
        pins.analogWritePin(pinB, 0);
    }
}

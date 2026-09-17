// Test file for BNET Extension - not included when others import the library
motorModule.setPins(AnalogPin.P0, AnalogPin.P1)
tof.init()
rfid.setup()

input.onButtonPressed(Button.A, function () {
    motorModule.rotate(60, motorModule.Direction.Forward)
})
input.onButtonPressed(Button.B, function () {
    motorModule.stop()
    basic.showNumber(tof.distance())
})
rfid.onCard(function (value: number) {
    basic.showNumber(value)
})

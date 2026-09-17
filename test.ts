bnet.setPins(AnalogPin.P0, AnalogPin.P1)
bnet.init()
bnet.setup()

input.onButtonPressed(Button.A, function () {
    bnet.rotate(60, bnet.Direction.Forward)
})
input.onButtonPressed(Button.B, function () {
    bnet.stop()
    basic.showNumber(bnet.distance())
})
bnet.onCard(function (value: number) {
    basic.showNumber(value)
})

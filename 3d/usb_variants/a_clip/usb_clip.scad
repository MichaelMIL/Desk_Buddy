// USB cover variant A: the click-in cover in round_bot.scad itself (the baseline the other
// variants are compared with). This file adds nothing to the cover or the body; it only adds
// the test coupon, so all variants can be tried on the same short print.
//
//   OpenSCAD -o stl/usb_test.stl -D 'part="usb_test"' usb_clip.scad
//
// Every other part ("usb_cover", "body_<theme>", "base", ...) renders as in round_bot.scad.
include <../../round_bot.scad>

// test coupon: the back of body_bare round the USB notch, printed upright like the body
// (about 15 minutes). Try the cover in it before printing a whole body.
usb_test_h = usb_z + usb_h/2 + 7;
module usb_test() intersection() {
    body("bare");
    translate([-27, 8, 0]) cube([54, 17, usb_test_h]);
}
if (part == "usb_test") usb_test();

// USB cover variant B: a captive sliding shutter.
//
// A shutter slides sideways in a shallow track across the lower back. Pushed to +x it covers
// the USB notch, flush with the back; pushed to -x it parks beside the notch and the whole
// notch is free for the cable's plug. (In this file left = -x and right = +x, as the model's
// axes run; seen from behind the robot, as the user sees it, that is the other way round.)
// Sideways is the only direction with room: above the notch the astro backpack starts at
// z = 11.2 and the back leans in from z = 13, below is the desk, and right of x = 7.5 is the
// cat's tail. So the shutter goes left, and its open end reaches just round the body's
// left back corner (the robot's right).
//
// The track is one 2D profile, drawn in the body's (y, z) plane and run along x, so it prints
// upright with the body without support:
//   - top rail: the track's upper edge overhangs the shutter at 45 degrees (a half dovetail).
//     The shutter's top edge is bevelled to match, so it cannot be pulled out at the top.
//   - bottom lip: a 0.75 mm wall along the bottom edge of the back, with a slot behind it.
//     The shutter's back layer hangs down into that slot, behind the lip, so it cannot be
//     pulled out at the bottom either. Square catch: pulling does not lever it out.
// Neither catch can spring open, so the shutter only goes in and out along the track. The
// track is closed at the right (the end wall is the "closed" stop) and runs out round the
// left back corner, where the shutter is put in.
//
// Detents: the left part of the shutter's back layer is a spring strip (a slit above it,
// hidden behind the lip). A bump under its tip rides on the floor of the slot and presses the
// shutter up into the top rail, so it does not rattle. It drops into a dip at each end of the
// travel: a click when closed and a click when open.
//
// Captive: at the open end the dip has a vertical left wall and the bump a vertical left face,
// so the shutter cannot be pushed on out of the track. On the way in the bump drops over that
// wall, so the shutter goes in from the left and then stays. To take it off, open it, lift the
// strip's tip (it shows at the corner, under the shutter's left end) with a fingernail, and
// slide the shutter out to the left. The base plate plays no part: fit the shutter any time.
//
// Prints back face down (part "usb_shutter"): a flat outline; the strip, slit and bump are in
// the plane of the bed, the top bevel narrows upwards. Only the body changes besides.
//
//   OpenSCAD -o stl/usb_cover.stl -D 'part="usb_shutter"' usb_slide.scad
//   OpenSCAD -o stl/body_bare.stl -D 'part="body_bare"'   usb_slide.scad
//   OpenSCAD -o stl/usb_test.stl  -D 'part="usb_test"'    usb_slide.scad
// "assembly", "base" and every "body_<theme>" render as in round_bot.scad, with this track.
// -D sl_open=1 draws the shutter open in the assembly views.
include <../../round_bot.scad>

// ---------- fit (tune these after the test print) ----------
sl_clr    = 0.12;   // gap at the 45-degree top rail (normal to it); the strip takes up the play
sl_back   = 0.05;   // gap behind the shutter: the top rail pushes it onto the track floor anyway
sl_lipclr = 0.1;    // gap between the shutter's back layer and the bottom lip
sl_xclr   = 0.15;   // clearance round the bump in the dips
sl_bump   = 0.45;   // bump height = how far the strip lifts between the dips (click strength)
sl_pre    = 0.07;   // the strip stays bent by this much when closed: the shutter cannot rattle
                    // (the strip is drawn straight, so closed, its bump overlaps the dip by this)
sl_strip_t = 1.25;  // spring strip: height (more = stiffer click; about 1.2 N at 1.25)
sl_strip_l = 7.5;   // and free length (shorter = stiffer; keep the bend under ~1.5 %)
sl_open   = 0;      // 0 closed, 1 open (preview / assembly only)

// ---------- track (body frame, mm) ----------
sl_yf   = 18.45;               // track floor: the wall behind it keeps 0.85 mm
sl_yl   = 19.25;               // back face of the bottom lip (lip 0.75 mm thick)
sl_ztop = 10.9;                // top of the shutter's face: 0.55 over the notch, under the backpack
sl_zlow = 1.5;                 // floor of the slot behind the lip (dips go 0.45 lower, still
                               // 0.7 mm clear of the base plate's 45-degree seat)
sl_zfb  = sl_zlow + sl_strip_t + sl_bump + 0.2;   // bottom of the shutter's face: over the
                                                  // strip, its slit and the lift
sl_zlip = sl_zfb - 0.15;       // top of the bottom lip
sl_xe   = 7.1;                 // right end wall of the track = the closed stop (cat's tail
                               // starts at 7.5)
sl_xlip = -19.3;               // the bottom lip ends here: further left the back curves away
sl_w    = 14.65;               // shutter width: notch 12.5 + 1.35 on the left + 0.8 on the right
sl_xc   = sl_xe - 0.05 - sl_w; // shutter's left end when closed (-7.6)
sl_travel = sl_xc + sl_w - (-usb_w/2 - 0.2);  // to 0.2 left of the notch when open (13.5)
sl_xo   = sl_xc - sl_travel;   // left end when open (-21.1): the gate wall
sl_hcd  = sl_bump - sl_pre;    // depth of the closed dip
sl_xcr  = sl_xc - 0.28 - sl_xclr;   // top of the closed dip's 45-degree ramp

// extrude a 2D shape drawn as (y, z) along +x from x0, length len
module yz_extrude(x0, len) translate([x0, 0, 0]) rotate([90, 0, 90]) linear_extrude(len) children();

// what the body loses: the notch as before, the track, the slot behind the lip and the dips
module usb_access() {
    xz_extrude(wall_in_y - 0.5, 10) usb_notch_2d();
    sl_track();
}
module sl_track() {
    // the track: face, 45-degree top rail and the slot behind the lip
    yz_extrude(-26, sl_xe + 26) polygon([[sl_yf, sl_zlow], [sl_yl, sl_zlow], [sl_yl, sl_zlip],
        [body_dp/2 + 0.05, sl_zlip], [body_dp/2 + 0.05, sl_ztop - 0.05], [body_dp/2, sl_ztop],
        [sl_yf, sl_ztop + body_dp/2 - sl_yf]]);
    // no lip where the back curves away (it would be a sliver); 45-degree lead-in at its end
    translate([-26, sl_yf, sl_zlow]) cube([26 + sl_xlip, 4, sl_zlip - sl_zlow + 0.01]);
    translate([sl_xlip, sl_yl - 0.01, sl_zlow]) linear_extrude(sl_zlip - sl_zlow + 0.01)
        polygon([[-0.01, 0], [0.45, 0], [-0.01, 0.46]]);
    // the right-hand lip's lead-in, for the shutter's foot
    translate([usb_w/2, sl_yl - 0.01, sl_zlow]) linear_extrude(sl_zlip - sl_zlow + 0.01)
        polygon([[-0.01, 0], [0.3, 0], [-0.01, 0.31]]);
    // dips in the slot floor, under the bump
    xz_extrude(sl_yf, sl_yl - sl_yf) {
        // closed: a 45-degree ramp down, then low up to the notch
        polygon([[sl_xcr - 0.01, sl_zlow + 0.01], [sl_xcr + sl_hcd, sl_zlow - sl_hcd], [-usb_w/2 + 0.3, sl_zlow - sl_hcd], [-usb_w/2 + 0.3, sl_zlow + 0.01]]);
    }
    xz_extrude(sl_yf, 4) {
        // open: vertical wall on the left (the gate), 45 degrees on the right
        polygon([[sl_xo, sl_zlow + 0.01], [sl_xo, sl_zlow - sl_bump], [sl_xo + 0.7 + sl_xclr, sl_zlow - sl_bump], [sl_xo + 0.7 + sl_xclr + sl_bump, sl_zlow + 0.01]]);
        // entry: the bump comes in low and rides up a 45-degree ramp before the gate
        polygon([[-26, sl_zlow + 0.01], [-26, sl_zlow - sl_bump], [sl_xo - 0.6 - sl_bump, sl_zlow - sl_bump], [sl_xo - 0.6, sl_zlow + 0.01]]);
    }
}

// the shutter, drawn closed in the body frame (for checks: lift raises the spring strip,
// rigid = true leaves it off)
module sl_shutter(lift = 0, rigid = false) {
    yb = sl_yf + sl_back;                 // back face
    yl = sl_yl - sl_lipclr;               // front of the back layer (behind the lip)
    zt = sl_ztop - sl_clr*sqrt(2);        // top of the face
    x1 = sl_xc + sl_w;
    intersection() {
        difference() {
            union() {
                // the face, with the top bevel
                yz_extrude(sl_xc, sl_w) polygon([[yb, sl_zfb], [body_dp/2, sl_zfb], [body_dp/2, zt], [yb, zt + body_dp/2 - yb]]);
                xz_extrude(yb, yl - yb) {
                    // spring strip along the left half, with the bump under its tip
                    if (!rigid) translate([sl_xc, sl_zlow + lift]) square([sl_strip_l + 1, sl_strip_t]);
                    if (!rigid) translate([sl_xc, sl_zlow + lift]) polygon([[0, 0.01], [0, -sl_bump + 0.1], [0.1, -sl_bump],
                                                        [0.7, -sl_bump], [0.7 + sl_bump, 0.01]]);
                    // rigid foot along the right half
                    translate([sl_xc + sl_strip_l, sl_zlow + sl_bump + 0.15]) square([x1 - sl_xc - sl_strip_l, sl_zfb - sl_zlow - sl_bump - 0.14]);
                }
            }
            // lead-in on the foot's front corner, for the right-hand lip
            translate([x1, yl + 0.01, 0]) linear_extrude(sl_zfb) polygon([[0.01, 0], [0.01, -0.31], [-0.3, 0]]);
            // three grip grooves, 0.45 deep
            for (x = [-1.6, 0, 1.6]) translate([x, 0, sl_zfb + 1.3])
                linear_extrude(zt - sl_zfb - 2.6) polygon([[-0.45, body_dp/2 + 0.01], [0.45, body_dp/2 + 0.01], [0, body_dp/2 - 0.45]]);
        }
        // when open, the left end reaches round the body's corner: follow its curve there,
        // but keep at least 0.8 mm
        union() {
            translate([sl_travel, 0, 0]) torso();
            translate([-60, 0, -10]) cube([120, yb + 0.8, 40]);
        }
    }
}
module usb_cover() translate([-sl_open*sl_travel, 0, 0]) sl_shutter();

// test coupon: the back of body_bare round the notch and the track, printed upright
usb_test_h = sl_ztop + body_dp/2 - sl_yf + 1.5;
module usb_test() intersection() {
    body("bare");
    translate([-27, 8, 0]) cube([54, 17, usb_test_h]);
}

if (part == "usb_shutter") show([90, 0, 0]) usb_cover();   // back face down
if (part == "usb_test")    usb_test();

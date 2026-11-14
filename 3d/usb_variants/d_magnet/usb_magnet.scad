// USB cover variant D: a magnetic cap. One pair of 4 mm disc magnets, no springs, nothing
// that wears.
//
//   OpenSCAD -o stl/usb_cover.stl -D 'part="usb_cover"' usb_magnet.scad
//   OpenSCAD -o stl/body_bare.stl -D 'part="body_bare"' usb_magnet.scad
//   OpenSCAD -o stl/usb_test.stl  -D 'part="usb_test"'  usb_magnet.scad
//
// Every other part ("body_<theme>", "base", "assembly", ...) renders as in round_bot.scad,
// with this cap and its pockets.
//
// How it works. The cap is a flat D-shaped plate, flush with the back: its right part is a plug
// that fills the notch, its left part a tab that lies in a recess in the back wall. The right
// side of the notch is undercut (wider inside than at the face), and the plug's right side
// leans the same way, so that side hooks in: it cannot be pulled straight out or lifted, only
// swung open about that edge like a door. The magnets sit at the far end of the tab, so they
// hold the door shut with the longest possible lever. To fit it, hook the plug's right edge in
// first, then swing the tab shut: it snaps. To open it, put a nail in the slot under the round
// end of the tab and swing it out.
//
// Why there and not beside or above the notch: on the cat body the tail starts 2 mm right of
// the notch (x 8.35, z 3.5 to 12), on the astro body the backpack's underside is 0.8 mm above it
// (z 11.15). Inside, the cradle's sprung fingers stand 0.2 mm in front of the wall at |x| 8.4 to
// 10.4, up to z 6. The tab and its magnet go where none of these are: left of the fingers.
//
// Magnets, both axially magnetised discs: a 4 x 1 mm in the cap, a 4 x 2 mm in the body (or two
// 4 x 1 stacked). They meet face to face, about 0.3 mm apart, through a pin on the back of the
// tab that sits in a hole in the recess floor; the body's magnet is at the bottom of that hole.
// POLARITY: the two must attract. Press the body magnet in first. Drop the cap magnet into the
// hole: it flips itself onto the body magnet the right way up. Mark its exposed face with a
// pen, lift it out and press it into the cap's pin marked face first. A drop of thin CA glue in
// each pocket stops the magnets pulling each other out.
include <../../round_bot.scad>

// ---------- tuning ----------
mg_d    = 4;        // magnet diameter
mg_t    = 1;        // thickness of the cap's magnet
mg_tb   = 2;        // thickness of the body's magnet (or of the stack)
mg_fit  = 0.2;      // pocket diameter over the magnet: press fit (+0.1 if it won't go in)
mg_deep = 0.1;      // pocket depth over the magnet, so a magnet never stands proud
mg_skin = 0.8;      // cap material in front of its magnet
mg_wall = 0.8;      // material round every pocket
mg_clr  = 0.12;     // gap round the cap, in its recess and in the notch
mg_pclr = 0.15;     // radial gap round the pin, in its hole
mg_gap  = 0.1;      // the pin stops this short of the floor of its hole: the tab seats first
mg_dp   = 0.8;      // depth of the recess = thickness of the tab
mg_hook = 0.6;      // undercut of the notch's right side, over the plug's depth (about 15 deg)
mg_x    = -13.45;   // magnet axis: left of the cradle's fingers, on the flat of the back,
mg_z    = 7.0;      //   and low enough for the tab to stay under the astro backpack
mg_xn   = -3;       // the tab reaches this far right (into the notch)
mg_zlo  = 1.5;      // the cap's lower edge meets the notch's left side this high
mg_slot = 4;        // width of the nail slot
mg_ns   = 0.6;      // and its depth (a 45-degree chamfer on the face's edge)

// ---------- derived ----------
mg_yo  = body_dp/2;                          // outer face of the back wall
mg_rp  = (mg_d + mg_fit)/2;                  // magnet pockets
mg_rpin = mg_rp + mg_wall;                   // the cap's pin, round its magnet
mg_rh  = mg_rpin + mg_pclr;                  // the pin's hole in the body
mg_R   = mg_rh + mg_dp/2;                    // round end of the tab's recess (see mg_face_2d)
mg_zf  = mg_z + mg_dp/2;                     // centre line of the tab at the outer face
mg_yc  = mg_yo - mg_skin - mg_t - mg_deep;   // end of the pin = mouth of the cap's pocket
mg_yh  = mg_yc - mg_gap;                     // floor of the pin's hole = mouth of the body's pocket
mg_yb  = mg_yh - mg_tb - mg_deep;            // floor of the body's pocket
mg_yp  = ucv_yi;                             // inner face of the plug: clear of the receptacle
mg_k   = mg_hook/(mg_yo - mg_yp);            // lean of the hooked side per mm of depth

// x' = x + mg_k*(mg_yo - y): leans to the right going in (the hooked side of the notch)
module mg_lean() multmatrix([[1, -mg_k, 0, mg_k*mg_yo], [0, 1, 0, 0], [0, 0, 1, 0]]) children();
// z' = z - (mg_yo - y): drops 1 mm per mm going in, for 45-degree roofs over the recess
module mg_drop() multmatrix([[1, 0, 0, 0], [0, 1, 0, 0], [0, 1, 1, -mg_yo]]) children();

// teardrop, point up: a horizontal hole in the upright body with a 45-degree roof
module mg_tear_2d(r) hull() {
    circle(r);
    polygon([[-r/sqrt(2), r/sqrt(2)], [r/sqrt(2), r/sqrt(2)], [0, r*sqrt(2)]]);
}

// outline of the recess (g = 0) and of the cap's face (g = -mg_clr, an even gap all round): the
// notch, plus a tab with a round end at the magnet, joined to the notch's left side down to mg_zlo
module mg_face_2d(g = 0) if (g == 0) mg_face0_2d(); else offset(r = g) mg_face0_2d();
module mg_face0_2d() union() {
    usb_notch_2d();
    hull() {
        intersection() { usb_notch_2d(); translate([-50, mg_zlo]) square(100); }
        hull() for (x = [mg_x, mg_xn]) translate([x, mg_zf]) circle(mg_R);
    }
}
// the recess (or the cap's rim) mg_dp deep, its top dropping at 45 degrees going in. Slice by
// slice it is the face outline cut by itself moved down by the depth, so it is never wider
// than at the face: the cap goes straight in. The round end therefore narrows to a circle of
// mg_R - mg_dp/2 = mg_rh round the magnet axis at the floor (why mg_zf is mg_dp/2 above it).
module mg_rim(g, y0, y1) intersection() {
    xz_extrude(y0, y1 - y0) mg_face_2d(g);
    mg_drop() xz_extrude(y0 - 2, y1 - y0 + 4) mg_face_2d(g);
}

// what the body loses: the notch (its right side undercut), the recess for the tab, the pin's
// hole and the magnet's pocket. The pocket is a teardrop. The pin's hole starts as the round end
// of the recess's floor and its roof rises at 45 degrees going in, so it meets the recess's
// roof (which rises going out) in a ridge: both print without support, with no thin wall.
module usb_access() {
    yf = mg_yo - mg_dp;
    xz_extrude(wall_in_y - 0.5, 10) usb_notch_2d();
    mg_lean() xz_extrude(wall_in_y - 0.5, mg_yo + 0.01 - (wall_in_y - 0.5)) usb_notch_2d();
    mg_rim(0, yf, mg_yo + 1);
    for (rise = [0, 1]) multmatrix([[1, 0, 0, 0], [0, 1, 0, 0], [0, -rise, 1, rise*yf]])
        xz_extrude(mg_yh, yf - mg_yh + 0.01) translate([mg_x, mg_z]) circle(mg_rh);
    xz_extrude(mg_yb, mg_yh - mg_yb + 0.01) translate([mg_x, mg_z]) mg_tear_2d(mg_rp);
}

// boss on the inside of the back wall: carries the magnet's pocket (mg_wall all round and
// behind it) and backs the rising roof of the pin's hole, which ends higher than the pocket.
// Its underside is a 45-degree V; its lower right side stays 0.3 mm clear of the cradle's
// finger (x -10.4, z 6) and its tip above the base plate. It is added after the body's cavity
// is cut, so the pocket is cut out of it here.
module mg_boss_2d() hull() {
    rise = mg_yo - mg_dp - mg_yh;   // how far the hole's roof has risen at its floor
    circle(mg_rpin);
    offset(r = mg_wall) mg_tear_2d(mg_rp);
    offset(r = 0.4) intersection() { translate([0, rise]) circle(mg_rh); translate([-10, mg_rh/sqrt(2)]) square(20); }
    translate([0, -mg_rpin*sqrt(2)]) square(0.01, center = true);
}
module usb_body_extra() difference() {
    xz_extrude(mg_yb - mg_wall, wall_in_y + 0.3 - (mg_yb - mg_wall)) translate([mg_x, mg_z]) mg_boss_2d();
    xz_extrude(mg_yb, mg_yh - mg_yb + 0.01) translate([mg_x, mg_z]) mg_tear_2d(mg_rp);
}

// the cap: the tab (with the rim round the notch), the plug that fills the notch and leans
// into its undercut side, and the pin that carries the magnet. Prints outer face down: every
// part is an outline grown upwards; the plug leans 15 degrees, the rim's top edge 45 degrees.
module usb_cover() difference() {
    union() {
        intersection() {
            mg_rim(-mg_clr, mg_yo - mg_dp, mg_yo);
            translate([-50, 0, 0.3]) cube([100, 100, 50]);   // clear of the desk
        }
        mg_lean() xz_extrude(mg_yp, mg_yo - mg_yp) intersection() {
            usb_notch_2d(-mg_clr);
            translate([-50, 0.3]) square(100);
        }
        xz_extrude(mg_yc, mg_yo - mg_dp - mg_yc + 0.01) translate([mg_x, mg_z]) circle(mg_rpin);
    }
    xz_extrude(mg_yc - 0.01, mg_yo - mg_skin - mg_yc + 0.01) translate([mg_x, mg_z]) circle(mg_rp);
    base_cone(0.08);
    // nail slot: a 45-degree chamfer, mg_ns deep, on the face's edge under the round end
    intersection() {
        difference() {
            xz_extrude(mg_yo - mg_ns, mg_ns + 1) offset(delta = 1) mg_face_2d(-mg_clr);
            hull() {
                xz_extrude(mg_yo - mg_ns - 0.01, 0.01) mg_face_2d(-mg_clr);
                xz_extrude(mg_yo - 0.01, 0.02) offset(delta = -mg_ns) mg_face_2d(-mg_clr);
            }
        }
        translate([mg_x - mg_slot/2 + 0.5, 0, 0]) cube([mg_slot, 50, mg_z]);
    }
}

// magnets, for the previews
module mg_magnet_body() translate([mg_x, 0, mg_z]) xz_extrude(mg_yb, mg_tb) circle(d = mg_d);
module mg_magnet_cap()  translate([mg_x, 0, mg_z]) xz_extrude(mg_yo - mg_skin - mg_t, mg_t) circle(d = mg_d);

// test coupon: the back of body_bare round the USB notch and the boss, printed upright like the
// body. Try the cap in it before printing a whole body.
usb_test_h = 13;   // above the boss (z 11.65) and the recess (10.85)
module usb_test() intersection() {
    body("bare");
    translate([-27, 8, 0]) cube([54, 17, usb_test_h]);
}
if (part == "usb_test") usb_test();

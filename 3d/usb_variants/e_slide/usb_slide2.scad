// USB cover variant E: sliding shutter, second version (after B, which the user found hard
// to slide, with a click that did not work and a shutter that was too thick).
//
// The shutter is a flat 1 mm plate that slides sideways in a dovetail track across the lower
// back: to +x it covers the USB window flush, to -x it parks beside it and the window is free
// for the cable. (+x is the robot's left, as you look at its back.) There is no room to
// slide any other way: the astro backpack starts at z = 11.15, the cat's tail at x = 7.4 and
// the desk is below.
//
// What changed from B:
//  - Easy to slide: 0.3 mm on the 45-degree flanks and 0.25 behind the shutter (B: 0.12 and
//    0.05), and nothing presses on the shutter while it slides, only at the clicks.
//  - The spring is in the body, not in the shutter: the strip of back wall behind the track
//    floor, cut free above and below by two slits, is a 10 mm beam with a bump on its outer
//    face. The body prints upright, so every layer holds the whole beam, bending in its own
//    plane: the strong way. It is 1.15 x 3 mm (B's strip was 0.65 x 1.25 mm, in the shutter).
//  - The shutter is 1 mm thick (B: 1.5) and has no hidden back layer: one plate, outer face
//    down on the bed, nothing thinner than 0.6 mm.
//  - The notch is now a window with a 2.4 mm bar under it, so the track's lower flank runs
//    unbroken under the shutter (the cable's plug starts at z = 2.85; the USB receptacle
//    still slides up past the bar's inside, 0.5 mm clear).
//
// The clicks: the shutter's back has a shallow channel where it passes the bump, so between
// the ends the bump does not touch it. Closed, the bump sits just past the shutter's left
// end, on a 35-degree chamfer, and pushes it against the end wall. Open, the bump sits in a
// pocket near the shutter's right end, pressing in a little (no rattle). Push it out of the
// pocket towards closed: click. The pocket's other wall is steeper (60 degrees), so the
// shutter does not come out of the open end unless you push it firmly that way: that is how
// it goes in and out, at the left back corner where the track runs out.
//
//   OpenSCAD -o stl/usb_cover.stl -D 'part="usb_cover"' usb_slide2.scad   (outer face down)
//   OpenSCAD -o stl/body_bare.stl -D 'part="body_bare"' usb_slide2.scad
//   OpenSCAD -o stl/usb_test.stl  -D 'part="usb_test"'  usb_slide2.scad
// "assembly", "base" and every "body_<theme>" render as in round_bot.scad, with this track.
include <../../round_bot.scad>

// ---------- fit (tune after the test print) ----------
es_clr   = 0.3;    // gap at the 45-degree flanks, normal to them: raise if it binds
es_back  = 0.25;   // gap between the track floor and the shutter's back
es_end   = 0.1;    // gap at the closed end wall (the bump takes it up)
es_t     = 1.0;    // shutter thickness
es_e     = 0.3;    // how far the spring is pushed in to pass a ridge: the click
es_pre   = 0.08;   // the bump still presses this much in the open pocket (no rattle)
es_exit  = 60;     // the pocket's outer wall (degrees): steeper holds the shutter in harder
es_lend  = 35;     // the shutter's left-end chamfer (degrees): what holds it closed
es_open  = 0;      // preview only: 1 draws the shutter open

// ---------- track ----------
es_d   = es_back + es_t;           // track depth, 1.25: the wall behind it keeps 1.15 mm
es_yf  = body_dp/2 - es_d;         // track floor (y)
es_zb  = 2.4;                      // bottom lip at the outer face = top of the bar under the window
es_zt  = 11.1;                     // top lip at the outer face (the astro backpack starts at 11.15)
es_xe  = 6.55;                     // closed end wall of the track
es_ro  = -usb_w/2 - 0.25;          // open: the shutter's right end, clear of the window
es_rc  = es_xe - es_end;           // closed: the shutter's right end
es_T   = es_rc - es_ro;            // travel (12.95)

// ---------- spring beam (in the wall behind the track floor) ----------
es_bz    = [6.4, 9.4];             // its height at the floor face: above the cradle's fingers (z <= 6)
es_slit  = 0.6;                    // the slits above and below it rise 45 degrees inwards (no bridge,
                                   // no line of sight through the wall)
es_bxr   = -16.6;                  // root
es_bxt   = -usb_w/2 - 0.35;        // tip, next to the window
es_bp    = es_back + es_e;         // bump height above the floor, relaxed (0.55)
es_btop  = 0.4;                    // width of the bump's flat top
es_bumpz = [7.1, 8.7];             // where the bump stands at full height (45 degrees above and below)
// shutter back: channel where the bump passes, pocket, ridges
es_rd    = 0.4;                    // channel depth: the shutter keeps 0.6 there
es_rz    = [es_bumpz[0] - es_e - 0.2, es_bumpz[1] + es_e + 0.2];   // where the bump stands above
                                   // the shutter's back plane, plus 0.2
es_g0    = 2.6;                    // channel starts here: further left the shutter is thinned
                                   // where it follows the corner when open
// layout from the pocket: bump centre u_o from the shutter's left end when open
es_uc    = 0;                      // closed: the bump centre sits at the left end, on the chamfer
es_pdep  = es_e - es_pre;          // pocket depth below the back face
es_k     = es_btop/2 + 0.05 + es_pdep/tan(es_exit) + 0.5 + es_e;   // pocket centre to right end
es_xb    = es_ro - es_k;           // the bump's x in the body
es_lc    = es_xb - es_uc;          // closed: shutter's left end
es_w     = es_rc - es_lc;          // shutter width
es_uo    = es_uc + es_T;           // pocket centre from the shutter's left end
es_yb    = es_yf + es_back;        // shutter's back face (y)
es_cv    = es_clr*sqrt(2);         // the flank gap measured vertically
echo(str("E slide: width ", es_w, ", travel ", es_T, ", closed ", es_lc, "..", es_rc,
         ", open ", es_lc - es_T, "..", es_ro, ", bump x ", es_xb));

// extrude a 2D shape drawn as (y, z) along +x from x0, length len
module yz_extrude(x0, len) translate([x0, 0, 0]) rotate([90, 0, 90]) linear_extrude(len) children();

// what the body loses: the window (the old notch above the bar), the receptacle's relief
// behind the bar, the track, and the slits that free the spring beam
module usb_access() {
    // window above the bar, through the wall
    xz_extrude(wall_in_y - 0.5, body_dp/2 - wall_in_y + 1)
        intersection() { usb_notch_2d(); translate([-50, es_zb]) square([100, 50]); }
    // below it, only inside: the USB receptacle rises past here with the base plate
    xz_extrude(wall_in_y - 0.5, 1.0) usb_notch_2d();
    // the track: dovetail, 45-degree flanks, open towards the corner
    yz_extrude(-30, es_xe + 30) polygon([[body_dp/2 + 0.01, es_zb + 0.01], [es_yf, es_zb - es_d],
        [es_yf, es_zt + es_d], [body_dp/2 + 0.01, es_zt - 0.01]]);
    // the spring beam: a slit above and below, rising 45 degrees inwards, and a gap at its tip
    sd = es_yf - wall_in_y + 0.4;      // through the wall and a little into the cavity
    yz_extrude(es_bxr, es_bxt - es_bxr) {
        polygon([[es_yf + 0.01, es_bz[1]], [es_yf + 0.01, es_bz[1] + es_slit],
                 [es_yf - sd, es_bz[1] + es_slit + sd], [es_yf - sd, es_bz[1] + sd]]);
        polygon([[es_yf + 0.01, es_bz[0] - es_slit], [es_yf + 0.01, es_bz[0]],
                 [es_yf - sd, es_bz[0] + sd], [es_yf - sd, es_bz[0] - es_slit + sd]]);
    }
    translate([es_bxt - 0.01, es_yf - sd, es_bz[0] - es_slit])
        cube([-usb_w/2 - es_bxt + 0.3, sd + 0.02, es_bz[1] - es_bz[0] + 2*es_slit + sd]);
}
// the bump on the beam's outer face (added after the cuts)
module usb_body_extra() es_bump();
module es_bump() {
    tr = [[es_xb - es_btop/2 - es_bp, es_yf - 0.01], [es_xb - es_btop/2, es_yf + es_bp],
          [es_xb + es_btop/2, es_yf + es_bp], [es_xb + es_btop/2 + es_bp, es_yf - 0.01]];
    base = [[es_xb - es_btop/2 - es_bp, es_yf - 0.01], [es_xb + es_btop/2 + es_bp, es_yf - 0.01],
            [es_xb + es_btop/2 + es_bp, es_yf], [es_xb - es_btop/2 - es_bp, es_yf]];
    hull() {   // 45 degrees above and below: no overhang
        translate([0, 0, es_bumpz[0]]) linear_extrude(es_bumpz[1] - es_bumpz[0]) polygon(tr);
        translate([0, 0, es_bumpz[0] - es_bp]) linear_extrude(es_bumpz[1] - es_bumpz[0] + 2*es_bp) polygon(base);
    }
}

// the shutter's back where the bump runs, as (u, y): u from its left end. Everything at y
// below this line is cut away (y here is the depth of the cut's floor).
function es_back_line() = let(b = es_yb, c = b + es_e, r = b + es_rd, p = b + es_pdep,
        uo = es_uo, h = es_btop/2 + 0.05) [
    [-1, c], [0, c], [es_e/tan(es_lend), b],                                  // left-end chamfer (closed hold)
    [es_g0, b], [es_g0 + es_rd, r],                                           // into the channel
    [uo - h - es_pdep - 0.3 - es_rd, r], [uo - h - es_pdep - 0.3, b],         // ridge before the pocket
    [uo - h - es_pdep, b], [uo - h, p], [uo + h, p],                          // pocket (45-degree wall)
    [uo + h + es_pdep/tan(es_exit), b],                                       // steep wall
    [es_w - es_e, b], [es_w, c], [es_w + 1, c]];                              // lead-in at the right end
module es_shutter() {
    difference() {
        intersection() {
            yz_extrude(es_lc, es_w) polygon([
                [es_yb, es_zb + es_cv - (body_dp/2 - es_yb)], [body_dp/2, es_zb + es_cv],
                [body_dp/2, es_zt - es_cv], [es_yb, es_zt - es_cv + body_dp/2 - es_yb]]);
            // open, its left end reaches round the corner: follow the body's curve there,
            // keeping at least 0.6 mm
            union() {
                translate([es_T, 0, 0]) torso();
                translate([-60, 0, -10]) cube([120, es_yb + 0.6, 40]);
            }
        }
        // the channel, pocket and chamfers on the back, where the bump runs
        translate([es_lc, 0, es_rz[0]]) linear_extrude(es_rz[1] - es_rz[0])
            polygon(concat([[-1, es_yb - 1]], es_back_line(), [[es_w + 1, es_yb - 1]]));
        // grip: three V grooves on the face, below the channel
        for (u = [-1.2, 0, 1.2]) translate([es_lc + es_w/2 + u + 0.6, 0, es_zb + es_cv + 0.6])
            linear_extrude(es_rz[0] - 0.4 - (es_zb + es_cv + 0.6))
                polygon([[-0.3, body_dp/2 + 0.01], [0.3, body_dp/2 + 0.01], [0, body_dp/2 - 0.3]]);
    }
}
module usb_cover() translate([-es_open*es_T, 0, 0]) es_shutter();

// test coupon: the back of body_bare round the window, the track and the spring, printed upright
usb_test_h = es_zt + es_d + 1.5;
module usb_test() intersection() {
    body("bare");
    translate([-27, 8, 0]) cube([54, 17, usb_test_h]);
}
if (part == "usb_test") usb_test();

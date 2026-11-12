// ============================================================
//  RoundBot – desk companion for a 1.28" GC9A01 round TFT
//  (240x240, 38 mm round PCB with 7-pin tab, ~45.5 mm tall)
//
//  The display IS the black face: it sits behind a thin bezel
//  lip, so only the active area shows. Draw the eyes in firmware.
//
//  No glue or screws anywhere. A wedge key locks the head onto the neck, the
//  back cap snaps in behind it, side pieces twist-lock into the head on a
//  sprung peg, the band's ends click into a slot in the top of each cup, the
//  base plate snaps into the body and the USB cover clicks into its notch.
//
//  Parts (set `part`, then F6 / export STL):
//    core:        "head_shell" "head_cap" "neck_key" "base" "usb_cover"
//    bodies:      "body_bare" "body_skeleton" "body_hoodie" "body_cat" "body_astro"
//                 (all need supports)
//    side pieces: "plug" (x2, fits both sides) "cup_left" "cup_right" "cup_mic"
//                 "pod_left" "pod_right"
//    bands:       "band_plain" "band_cat" "band_bug" "band_bear" "band_bunny"
//                 "band_devil" "band_crown" "band_dino" "band_unicorn"
//  Template = core + body_bare + 2 plugs. To add a theme, copy plug(),
//  topper_2d() or body("bare") and keep their interfaces.
//    "assembly" - coloured preview of the DJ theme
//
//  Units: mm. Front of the robot faces -Y. Z is up.
// ============================================================

part   = "assembly";
placed = false;   // true: export the part in its assembled position (used for checks)

$fn = 96;
clr = 0.3;                 // general fit clearance

// ---------- display module (from the AITEXM drawing) ----------
pcb_d      = 38.0;         // round PCB diameter
tab_w      = 22.92;        // width of the header tab
pcb_h      = 45.5;         // top of circle to bottom of tab
tab_below  = pcb_h - pcb_d/2;   // 26.5: circle centre -> tab bottom
tft_t      = 1.5;          // glass + backlight thickness
pcb_t      = 1.6;
aa_d       = 32.4;         // active area
// If the glass isn't concentric with the PCB on your unit,
// shift the window here (+ = up).
screen_off_z = 0;

// ---------- head ----------
view_d     = 33.0;         // bezel window (slightly > active area)
lip        = 1.4;          // bezel lip in front of the glass
chamfer    = 0.8;          // window chamfer
head_d     = 52;
head_depth = 30;
head_rf    = 5;            // front edge round
head_rb    = 6;            // back edge round
wall       = 2;
head_flat  = 21.5;         // flat bottom, distance below face centre
split_y    = head_depth - 4;  // shell / back-cap split
spigot_len = 5;
spigot_clr = 0.15;         // press fit; increase if too tight
post_d     = 3;            // cap posts that press the PCB forward
post_r     = 17;
post_angles = [45, 135, 215, 325];   // lower two sit clear of the neck posts
post_gap   = 0.2;        // posts stop this far behind the PCB
// snap teeth on the cap: three springy beams, each with a tooth that
// clicks in behind the lip of the shell opening
snap_bite   = 0.42;        // how much the tooth stands proud of the lip
snap_angles = [0, 90, -90];     // around the head axis, 0 = top
snap_len    = 20;  snap_t = 0.9;

pcb_back_y = lip + tft_t + pcb_t;   // 4.5

// ---------- neck (head-local Y) ----------
neck_in_x  = tab_w/2 + 0.6;          // 12.06
neck_in_y0 = lip + 0.8;              // just in front of PCB plane
neck_in_y1 = 18;                     // room for header pins + wires
neck_wall  = 1.6;

// ---------- body ----------
body_w = 52; body_dp = 40; body_h = 36;
body_rt = 12; body_rb = 8; body_wall = 2.4;
head_front_y = -15;                  // head local y=0 in body coords
head_cz      = 60.5;                 // face centre height
head_bottom_z = head_cz - head_flat; // 39
neck_plug    = 1.95;                 // how far the neck enters the head: its top meets the
                                     // ceiling of the 2 mm socket, so the head rests on the neck
neck_fit     = 0.15;                 // the plug is this much fatter than the neck: snug in the socket
// head-to-body connection: two posts on the neck come up through the socket in the
// head's floor, behind the display. Each has an inward rib with a 45-degree underside.
// A wedge key (neck_key) slides in from the back of the head, under both ribs, and
// stands on the head's inner wall. Pushing it in pulls the neck up, i.e. clamps the
// head down onto its rests with no play; the back cap then closes behind it.
rest_gap   = 0.05;          // gap between the rest block and the head's underside
post_y0    = 9.6;           // posts, head-local y (front)
post_y1    = neck_in_y1 + neck_wall;       // (back) = 19.6
post_xi    = 11.4;          // inner face of the posts
post_top   = -13.8;         // head-local z of the post tops
nrib_p     = 2.2;           // rib overhang at the front of the posts
key_taper  = 0.1228;        // tan(7 deg): ribs and key converge by this much per mm
key_zb     = -19.0;         // key plate, head-local z (bottom)
key_zt     = post_top - 0.4;               // (top) = -14.2
key_travel = 2.1;           // the key may end up this far ahead of / behind nominal
key_pos    = 0.4;           // where the key is drawn: mm before it goes tight
key_fat    = 0;             // fit trim for the key only: +0.1 makes it go tight 0.8 mm earlier
function nrib(y) = nrib_p - key_taper*(y - post_y0);     // rib overhang at head-local y

// ---------- electronics ----------
// ESP32-S3 SuperMini: 23.5 x 18 incl. USB-C overhang
mcu_w = 18.0;
mcu_l = 22.5;      // PCB only
usb_over = 1.0;    // USB-C receptacle overhang past the PCB edge
mcu_t = 1.0;       // PCB thickness (measure yours: 1.0-1.2)
mcu_standoff = 2;
mcu_clr  = 0.1;    // side and end clearance of the PCB in its cradle
mcu_edge = 0.7;    // the cradle holds only this much of each long edge: clear of the pin pads
mcu_hook = 0.6;    // how far the rear hooks reach over the board's back corners
plate_t = 2;
usb_w = 12.5; usb_h = 7.5;           // notch fits a typical cable overmold
// base plate: seats on a 45-degree cone in the body rim and snaps over
// two ribs on the side walls (no screws)
base_seat = 1.2;   // width of the conical seat
base_clr  = 0.12;  // side gap of the plate
rib_x     = 23.2;  // tip of the catch ribs (from the centre line)
rib_z     = 3.6;   // top of the catch ribs
base_bite = 0.5;   // how far the plate's teeth reach past the ribs
base_play = -0.3;  // tooth sits this far below the rib: the beams stay bent and
                   // press the plate up into its seat (no play, no rattle)

// ---------- headphones ----------
band_r_in = head_d/2 + 1.5;
band_t = 3.5; band_w = 9; band_y = -1;
cup_d = 24; cup_x1 = 34.5; cup_z = -1;

// ---------- glue-free joints ----------
// ear twist-lock (bayonet): peg + two lugs on every side piece
seat_d  = 22;              // flat seat boss on each side of the head
seat_x  = head_d/2 + 0.3;  // seat face, distance from head axis
cup_gap = 0.02;            // side pieces are pulled flat onto the seat
peg_d   = 6.0;  hole_d = 6.5;
lug_r   = 4.5;  lug_w = 2.6;
// The peg stands on a spring beam inside the side piece. Its lugs sit ear_tension
// closer to the piece than the wall is thick, so when locked the beam is bent by
// that much and pulls the piece tight against the head.
bump_r = 7.5;              // (dimples in the head shell, kept so the shell is unchanged)
ear_tension = 0.15;        // how far the spring beam stays bent when locked
lug_relief  = 0.24;        // back lug sits this much deeper (it sweeps the lower half
                           // of the keyhole, where the curved wall asks for more room)
beam_w = 6.4;  beam_len = 20;  beam_t = 0.8;   // spring beam under the peg
beam_rec = 0.5;            // beam is set back from the inner face by this much
beam_gap = 0.6;            // free space behind the beam (it prints as a bridge)
// band to cup: each end of the band runs on down as a flat tab, the band's full width,
// into a slot in the top of its cup. A small hook on the tip clicks into a groove at the
// bottom of the slot and the tip rests on the slot floor. The band itself is the spring:
// it squeezes in by the hook's height while the hook passes. Made for FDM: the whole
// band, tabs included, is one 2D outline extruded through its width, and the slot is
// open towards the head, so neither part needs support or a bridge.
band_seat = 0.05;          // drawn gap between the band's end and the cup
btab_x0   = seat_x + 0.6;  // inner face of the tab, from the head axis. The gap to the
                           // head lets the band squeeze in while the hook passes
btab_t    = 2.5;           // tab thickness (about 5 perimeters)
btab_zb   = cup_z + 4.4;   // tip of the tab (head frame); the slot floor keeps 0.85 mm
                           // over the twist-lock's spring pocket below it
btab_hook = 0.45;          // how far the hook stands out: raise for a firmer click
btab_clr  = 0.15;          // clearance around the tab in its slot
btab_pre  = 0.1;           // the hook stays pressed on its catch by this much: no rattle
btab_x1   = btab_x0 + btab_t;             // outer face of the tab
hook_zl   = btab_zb + 1.2;                // top of the hook's lead-in ramp
hook_zc   = hook_zl + 0.6;                // top of its flat; the catch above it is at
hook_dz   = btab_hook*tan(30);            // 60 degrees to the push direction
cuff_x    = btab_x1 + btab_clr + 0.25;    // the band's end thickens into a cuff whose outer face
                                          // reaches past the slot's wall: it covers the slot's mouth
ear_y   = band_y - head_front_y;   // head-local position of the ear axis
ear_z   = cup_z;
// ============================================================
//  helpers
// ============================================================
// extrude a 2D shape drawn as (x, z) along +Y from y0, length len
module xz_extrude(y0, len) {
    // rotate +90 about X maps 2D (x, v) -> (x, -t, v); no mirror needed
    translate([0, y0 + len, 0]) rotate([90, 0, 0])
        linear_extrude(len) children();
}

module rounded_puck(R, D, rf, rb) {
    rotate([-90, 0, 0]) rotate_extrude()
        hull() {
            square([0.01, D]);
            translate([R - rf, rf]) circle(rf);
            translate([R - rb, D - rb]) circle(rb);
        }
}

// ============================================================
//  head (local frame: face centre at origin, front at y=0, +Y back)
// ============================================================
module head_solid() {
    intersection() {
        rounded_puck(head_d/2, head_depth, head_rf, head_rb);
        translate([-100, -1, -head_flat]) cube([200, 200, 200]);
    }
}

module pocket_2d() {
    // PCB outline + tab, with clearance
    translate([0, screen_off_z]) {
        circle(d = pcb_d + 2*clr);
        translate([-(tab_w/2 + clr), -(tab_below + clr + 5)])
            square([tab_w + 2*clr, tab_below + clr + 5]);
    }
}

module head_cavity() { head_pocket(); head_hollow(); head_socket(); }

module head_pocket() {
    // screen pocket, open all the way to the back
    xz_extrude(lip, head_depth + 2) pocket_2d();
    // viewing window + chamfer
    translate([0, 0, screen_off_z]) rotate([-90, 0, 0]) {
        translate([0, 0, -1]) cylinder(d = view_d, h = lip + 2);
        translate([0, 0, -0.01])
            cylinder(d1 = view_d + 2*chamfer, d2 = view_d, h = chamfer);
    }
}

module head_hollow() {
    R_in = head_d/2 - wall;
    rb_in = head_rb - wall;
    // main hollow behind the PCB, wall follows the back round
    intersection() {
        rotate([-90, 0, 0]) rotate_extrude() hull() {
            // 45-degree step out from the PCB pocket: prints face-down without support
            translate([0, pcb_back_y]) square([pcb_d/2 + clr, 0.01]);
            translate([0, pcb_back_y]) square([0.01, head_depth - wall - pcb_back_y]);
            translate([R_in - rb_in, head_depth - head_rb]) circle(rb_in);
            translate([R_in - 0.01, pcb_back_y + (R_in - pcb_d/2 - clr)])
                square([0.01, head_depth - head_rb - pcb_back_y - (R_in - pcb_d/2 - clr)]);
        }
        translate([-100, -1, -head_flat + wall]) cube([200, 200, 200]);
    }
}

module head_socket() {
    // neck socket through the floor
    translate([-(neck_in_x + neck_wall + clr), neck_in_y0 - neck_wall - clr, -head_flat - 1])
        cube([2*(neck_in_x + neck_wall + clr),
              (neck_in_y1 - neck_in_y0) + 2*(neck_wall + clr), wall + 1.01]);
}

module ear_frame(s) { translate([0, ear_y, ear_z]) rotate([0, 90*s, 0]) children(); }

module head_shell() {
    x_in = sqrt(pow(head_d/2 - wall, 2) - pow(ear_z, 2));
    difference() {
        union() {
            intersection() {
                head_solid();
                translate([-100, -1, -100]) cube([200, split_y + 1, 200]);
            }
            // flat seats for the side pieces
            for (s = [-1, 1]) ear_frame(s) translate([0, 0, 10]) cylinder(d = seat_d, h = seat_x - 10);
        }
        head_cavity();
        for (s = [-1, 1]) ear_frame(s) {
            // keyhole: round hole + slot (lugs enter along Z, lock along Y)
            translate([0, 0, x_in - 3]) cylinder(d = hole_d, h = 10);
            translate([-(lug_r + 0.4), -(lug_w/2 + 0.25), x_in - 3]) cube([2*(lug_r + 0.4), lug_w + 0.5, 10]);
            // detent dimples
            for (d = [-1, 1]) translate([0, d*bump_r, seat_x + 0.6]) sphere(r = 1.1, $fn = 24);
        }
    }
}

module head_cap() {
    R_open = (head_d/2 - wall - head_rb + wall)
             + sqrt(pow(head_rb - wall, 2) - pow(split_y - (head_depth - head_rb), 2));
    back_in = head_depth - wall;        // inner face of the back wall
    union() {
        difference() {
            intersection() {
                head_solid();
                translate([-100, split_y, -100]) cube([200, 100, 200]);
            }
            head_hollow();
        }
        // spigot ring: fills the shell opening, fused to the back wall
        difference() {
            intersection() {
                translate([0, split_y - spigot_len, 0]) rotate([-90, 0, 0])
                    difference() {
                        cylinder(r = R_open - spigot_clr, h = back_in - split_y + spigot_len + 0.5);
                        translate([0, 0, -1]) cylinder(r = R_open - spigot_clr - 1.6, h = 50);
                    }
                translate([-100, -1, key_zt + 0.8]) cube([200, 200, 200]);   // no ring low down: the neck key lives there
                head_solid();
            }
            // windows for the snap beams
            for (a = snap_angles) rotate([0, a, 0])
                translate([-snap_len/2, split_y - spigot_len - 0.1, 15]) cube([snap_len, spigot_len + 0.1, 12]);
        }
        // snap beams (straight, bridge between the ring ends) with teeth
        for (a = snap_angles) rotate([0, a, 0]) {
            Rr = R_open - spigot_clr;
            zf = sqrt(Rr*Rr - snap_len*snap_len/4) + 0.45;      // outer face of the beam
            y0 = split_y - 2.6;  y1 = split_y + 0.6;
            intersection() {
                translate([-snap_len/2 - 1.2, y0, zf - snap_t]) cube([snap_len + 2.4, y1 - y0, snap_t]);
                rotate([-90, 0, 0]) cylinder(r = Rr, h = 40);
            }
            intersection() {
                rotate([90, 0, 90]) linear_extrude(5, center = true)
                    polygon([[y0, zf - 0.1], [y0, R_open - 0.45], [split_y - 1.2, R_open + snap_bite], [y1, zf - 0.1]]);
                rotate([-90, 0, 0]) cylinder(r = R_open + snap_bite, h = 40);
            }
        }
        // tongue that closes the tab slot in the floor behind the neck
        translate([-(tab_w/2 + clr - 0.2), neck_in_y1 + neck_wall + clr + 0.2, -head_flat])
            cube([2*(tab_w/2 + clr - 0.2), split_y + 0.5 - (neck_in_y1 + neck_wall + clr + 0.2), wall]);
        // backstop: the neck key cannot back out past this
        translate([-6, split_y + 0.3, key_zb + 0.5]) cube([12, back_in + 0.5 - (split_y + 0.3), key_zt - key_zb - 1]);
        // posts that press the PCB against the bezel lip
        for (a = post_angles)
            translate([post_r*cos(a), pcb_back_y + post_gap, post_r*sin(a) + screen_off_z])
                rotate([-90, 0, 0]) cylinder(d = post_d, h = back_in - pcb_back_y - post_gap + 0.5);
    }
}

module place_head() { translate([0, head_front_y, head_cz]) children(); }

// ============================================================
//  headphones (body frame)
// ============================================================
cup_in = seat_x + cup_gap;      // inner face of every side piece
leg_xi   = btab_x0;                        // the band's ends stay clear of the seat bosses
seat_top = cup_z + seat_d/2 + 0.3;         // ... below this height

module band_ring_2d() difference() { circle(r = band_r_in + band_t); circle(r = band_r_in); }
module mir() { for (m = [0, 1]) mirror([m, 0]) children(); }
// x-z outline of the band: the ring, whose ends come down onto the cups and thicken
// into cuffs there (beside the seat bosses they keep clear of them)
module band_profile_2d() intersection() {
    union() { band_ring_2d(); mir() cuff_2d(); }
    union() {
        translate([-100, seat_top]) square([200, 100]);
        mir() translate([leg_xi, cup_z]) square([20, seat_top - cup_z + 0.01]);
    }
}
// right-hand cuff: straight down at cuff_x onto the cup, and a tangent from there up to the
// band's outer curve
module cuff_2d() let(P = [cuff_x, cup_z + cup_d/2 + 0.3], a = atan2(P[1], P[0]) + acos(R_b/norm(P)))
    difference() {
        polygon([[0, 0], [leg_xi, cup_z], [cuff_x, cup_z], P, R_b*[cos(a), sin(a)]]);
        circle(r = band_r_in);
    }
// outside of the right-hand cup, grown by g: the band's end is cut to sit on it
module cup_top(g) translate([cup_in - 0.02, band_y, head_cz + cup_z]) rotate([0, 90, 0]) cylinder(r = cup_d/2 + g, h = 10);

// x-z outline of the right-hand tab (head frame): lead-in, hook, catch. Its top ends
// inside the cuff.
module btab_2d() let(zt = cup_z + cup_d/2 + 0.4) polygon([
    [btab_x0, zt], [btab_x0, btab_zb + 0.4], [btab_x0 + 0.4, btab_zb], [btab_x1 - 0.1, btab_zb],
    [btab_x1 + btab_hook, hook_zl], [btab_x1 + btab_hook, hook_zc], [btab_x1, hook_zc + hook_dz], [btab_x1, zt]]);
// the slot in the cup: the tab plus clearance, open towards the head, with the groove
// for the hook at the bottom. The tip stands on its floor; the slot's catch sits
// btab_pre inside the hook's, so the band is pulled down onto the floor.
module btab_slot_2d() let(c = btab_clr, h = btab_hook, k = hook_dz/btab_hook, zt = cup_z + cup_d/2 + 2) polygon([
    [cup_in - 1, zt], [cup_in - 1, btab_zb], [btab_x1 + h + c, btab_zb],
    [btab_x1 + h + c, hook_zc - (c + btab_pre)*k], [btab_x1 + c, hook_zc + (h - btab_pre - c)*k], [btab_x1 + c, zt]]);

// the plain band in 3D: ring with its ends cut to the cups' shape, and the two tabs
module band_base() {
    difference() {
        band_ex() band_profile_2d();
        for (m = [0, 1]) mirror([m, 0, 0]) cup_top(band_seat);
    }
    band_ex() mir() btab_2d();
}

module band_ex(y0 = -band_w/2, w = band_w) translate([0, 0, head_cz]) xz_extrude(band_y + y0, w) children();

// style: "plain", "cat" (ears), "bug" (two antennae)
module band(style = "plain") {
    band_base();
    if (style == "cat") difference() {
        band_ex() for (m = [0, 1]) mirror([m, 0]) rotate(-33) cat_ear_2d();
        // recessed inner ear on the front face
        band_ex(-band_w/2 - 1, 2.2) for (m = [0, 1]) mirror([m, 0]) rotate(-33)
            translate([0, band_r_in + band_t + 1.5]) offset(r = 1) offset(delta = -4.2) translate([0, -(band_r_in + band_t + 1.5)]) cat_ear_2d();
    }
    if (style != "plain" && style != "cat" && style != "bug") difference() {
        band_ex() topper_2d(style);
        band_ex(-band_w/2 - 1, 2.0) topper_recess_2d(style);
    }
    if (style == "bug") for (sx = [-1, 1]) {
        // stalks flush with the back face (print side), ball on top
        band_ex(band_w/2 - 5, 5) rotate(-sx*24) translate([-1.6, band_r_in + band_t - 1]) square([3.2, 13]);
        intersection() {
            translate([0, band_y, head_cz]) rotate([0, sx*24, 0]) translate([0, 0, band_r_in + band_t + 14]) sphere(r = 4.6, $fn = 48);
            translate([-100, band_y - band_w/2, 0]) cube([200, band_w, 200]);
        }
    }
}
// extra band toppers: [outline, recess on the front face]
R_b = band_r_in + band_t;
module topper_2d(style) {
    r0 = R_b - 1;
    if (style == "bear")  mir() rotate(-35) translate([0, R_b + 4]) circle(r = 8);
    if (style == "bunny") mir() rotate(-20) hull() { translate([0, R_b + 2]) circle(r = 5.5); translate([0, R_b + 24]) circle(r = 4.2); }
    if (style == "devil") mir() rotate(-36) {
        hull() { translate([0, R_b]) circle(r = 5); translate([2, R_b + 7]) circle(r = 3); }
        hull() { translate([2, R_b + 7]) circle(r = 3); translate([6.5, R_b + 12.5]) circle(r = 0.9, $fn = 16); }
    }
    if (style == "crown") {
        intersection() {
            difference() { circle(r = R_b + 3.5); circle(r = r0); }
            polygon([[0, 0], [-60, 66], [60, 66]]);
        }
        for (a = [-32, -16, 0, 16, 32]) rotate(-a) {
            polygon([[-5, R_b + 3], [5, R_b + 3], [0, R_b + 13]]);
            translate([0, R_b + 13]) circle(r = 1.7, $fn = 24);
        }
    }
    if (style == "dino") for (a = [-44, -22, 0, 22, 44]) rotate(-a)
        offset(r = 1) offset(delta = -1) polygon([[-6, r0], [6, r0], [0, R_b + (a == 0 ? 13 : 10)]]);
    if (style == "unicorn") {
        offset(r = 0.8) offset(delta = -0.8) polygon([[-3.8, r0], [3.8, r0], [0, R_b + 25]]);
        mir() rotate(-38) offset(r = 1.2) offset(delta = -1.2) polygon([[-6, r0], [6, r0], [0, R_b + 11]]);
    }
}
module topper_recess_2d(style) {
    if (style == "bear")  mir() rotate(-35) translate([0, R_b + 5]) circle(r = 4.5);
    if (style == "bunny") mir() rotate(-20) hull() { translate([0, R_b + 5]) circle(r = 2.8); translate([0, R_b + 22]) circle(r = 2.2); }
    if (style == "unicorn") for (k = [5, 10, 15, 20]) translate([-5, R_b + k]) rotate(18) square([10, 0.9]);
}

module cat_ear_2d() {
    r0 = band_r_in + band_t - 1;
    offset(r = 1.5) offset(delta = -1.5) polygon([[-9, r0], [9, r0], [1.5, r0 + 16], [-1.5, r0 + 16]]);
}

// peg and lugs shared by every side piece (ear frame: z = outward).
// The peg stands on a spring beam, so the lugs can sit closer than the wall is
// thick: twisting it in bends the beam and the piece is held under tension.
// The head's inner wall is curved, so the lug that sweeps the LOWER half of the
// keyhole meets a deeper wall. The +y lug is the tight one and should point UP
// while pushing in (dot on the outer face up); the -y lug is relieved.
module ear_lock() {
    x_in = sqrt(pow(head_d/2 - wall, 2) - pow(ear_z, 2));
    Rc = 1.8;                                  // crown: the lug's flanks are ramps
    module lug(x_l, sy) mirror([0, sy > 0 ? 0 : 1, 0]) intersection() {
        union() {
            translate([0, 0, x_l - 1.9]) cylinder(r = lug_r, h = 0.4);
            translate([0, 0, x_l - 1.5]) cylinder(r1 = lug_r, r2 = peg_d/2, h = 1.5);
        }
        translate([-lug_w/2, 0, x_l - 3]) cube([lug_w, lug_r, 6]);
        translate([0, peg_d/2 - Rc/sqrt(2), x_l - Rc/sqrt(2)]) rotate([45, 0, 0]) cylinder(r = Rc, h = 20, center = true, $fn = 64);
    }
    x_t = x_in + 0.25 + ear_tension + lug_relief/2 + cup_gap;  x_b = x_t - lug_relief;
    translate([0, 0, x_b - 1.9]) cylinder(d = peg_d, h = cup_in + beam_rec + beam_t - (x_b - 1.9));
    lug(x_t, 1);  lug(x_b, -1);
    // spring beam: a bridge across a pocket, the peg stands on its middle
    translate([-beam_w/2, -beam_len/2 - 0.5, cup_in + beam_rec]) cube([beam_w, beam_len + 1, beam_t]);
}
// pocket around the spring beam, and the "this side up" dot on the outer face
module ear_cut(z_out) {
    translate([-(beam_w/2 + 0.35), -beam_len/2, cup_in - 0.01])
        cube([beam_w + 0.7, beam_len, beam_rec + beam_t + beam_gap + 0.01]);
    translate([0, 6.5, z_out - 0.5]) cylinder(d = 2.4, h = 1, $fn = 24);
}

// headphone cup: twist-locks into the head, the band's tab then clicks into its slot
module cup(side = 1) {
    difference() {
        translate([0, band_y, head_cz + cup_z]) rotate([0, 90*side, 0])
            hull() {
                translate([0, 0, cup_in]) cylinder(d = cup_d, h = 5);
                translate([0, 0, cup_x1 - 3]) cylinder(d = cup_d - 5, h = 3);
            }
        // groove between pad and shell (shallow, and out past the band's slot)
        translate([0, band_y, head_cz + cup_z]) rotate([0, 90*side, 0])
            translate([0, 0, cup_in + 3.7]) difference() {
                cylinder(d = cup_d + 2, h = 0.8);
                translate([0, 0, -1]) cylinder(d = cup_d - 1.0, h = 3);
            }
        translate([0, band_y, head_cz + cup_z]) rotate([0, 90*side, 0]) ear_cut(cup_x1);
        // slot for the band's tab: open at the top and towards the head
        translate([0, 0, head_cz]) mirror([side < 0 ? 1 : 0, 0, 0])
            xz_extrude(band_y - band_w/2 - btab_clr, band_w + 2*btab_clr) btab_slot_2d();
    }
    translate([0, band_y, head_cz + cup_z]) rotate([0, 90*side, 0]) ear_lock();
}

// left cup with a headset mic boom (lies flat on the bed with the cup's outer face)
module cup_mic() {
    cup(-1);
    Pm = [[band_y, cup_z], [band_y - 15, cup_z - 8], [band_y - 26, cup_z - 10.5]];
    intersection() {
        translate([-(cup_x1 - 1.3), 0, head_cz]) {
            for (i = [0, 1]) hull() for (j = [i, i + 1]) translate([0, Pm[j][0], Pm[j][1]]) sphere(r = 1.7, $fn = 24);
            translate([0, Pm[2][0], Pm[2][1]]) sphere(r = 3.1, $fn = 32);
        }
        translate([-cup_x1, -100, 0]) cube([cup_x1, 200, 200]);
    }
}

// plain side plug: covers a keyhole when no cup is used. Fits either side.
module plug() {
    translate([0, band_y, head_cz + cup_z]) rotate([0, -90, 0]) {
        difference() {
            hull() {
                translate([0, 0, cup_in]) cylinder(d = seat_d + 2, h = 3);
                translate([0, 0, cup_in]) cylinder(d = seat_d - 2, h = 5);
            }
            ear_cut(cup_in + 5);
        }
        ear_lock();
    }
}

// astronaut comms pod: no band, held by the twist-lock detent; antenna on the right
module pod(side = 1) {
    translate([0, band_y, head_cz + cup_z]) rotate([0, 90*side, 0]) {
        difference() {
            hull() {
                translate([0, 0, cup_in]) cylinder(d = seat_d + 2, h = 3);
                translate([0, 0, cup_in]) cylinder(d = seat_d - 2, h = 5);
            }
            ear_cut(cup_in + 5);
        }
        ear_lock();
    }
    if (side > 0) intersection() {
        translate([cup_in + 3.7, band_y, head_cz + cup_z]) union() {
            cylinder(d = 3.2, h = 37, $fn = 32);
            translate([0, 0, 37]) sphere(r = 2.8, $fn = 32);
        }
        translate([0, -100, 0]) cube([cup_in + 5, 200, 200]);   // flat on the print bed
    }
}

// ============================================================
//  body (body frame)
// ============================================================
// pear-shaped torso: base 52x40, belly bulges to the front and sides, narrow shoulders
sh_w = 46; sh_d = 34;
module torso(inset = 0) {
    hull() {
        for (sx = [-1, 1], sy = [-1, 1])
            translate([sx*(body_w/2 - body_rb), sy*(body_dp/2 - body_rb), -1])
                cylinder(r = body_rb - inset, h = 1.01);
        for (sx = [-1, 1]) {
            translate([sx*16, -10, 13]) sphere(r = 12 - inset, $fn = 64);
            translate([sx*16,   8, 13]) sphere(r = 12 - inset, $fn = 64);
            for (sy = [-1, 1])
                translate([sx*(sh_w/2 - body_rt), sy*(sh_d/2 - body_rt), body_h - body_rt]) sphere(r = body_rt - inset, $fn = 64);
        }
    }
}

neck_y0b = head_front_y + neck_in_y0;   // body-frame interior
neck_y1b = head_front_y + neck_in_y1;
neck_cy  = (neck_y0b + neck_y1b)/2;

module neck_box(grow, z0, z1) {
    translate([0, neck_cy, z0]) linear_extrude(z1 - z0)
        offset(r = 2) offset(delta = -2)
            square([2*(neck_in_x + grow), (neck_y1b - neck_y0b) + 2*grow], center = true);
}

module collar() {
    translate([0, neck_cy - 1, body_h - 1.6]) scale([1.25, 1.12, 0.75])
        rotate_extrude($fn = 64) translate([13.5, 0]) circle(r = 5.5, $fn = 32);
}
// the hood hanging down the back
module hood_bag() { translate([0, 12.5, 28]) scale([1.35, 0.72, 1]) sphere(r = 10, $fn = 64); }

module cat_tail() {
    P = [[11, 17, 7], [19, 22, 8], [25, 23, 15], [25.5, 21, 24], [22, 19, 31]];
    for (i = [0 : len(P) - 2]) hull() {
        translate(P[i]) sphere(r = 4 + (i == len(P) - 2 ? 0 : 0), $fn = 32);
        translate(P[i + 1]) sphere(r = (i == len(P) - 2 ? 4.8 : 4), $fn = 32);
    }
}
module backpack() {
    hull() {
        for (sx = [-1, 1], z = [17, 31]) {
            translate([sx*11, 19, z]) sphere(r = 3, $fn = 32);
            translate([sx*11, 24.5, z]) sphere(r = 3, $fn = 32);
        }
        for (sx = [-1, 1]) translate([sx*10, 18.5, 11.5]) sphere(r = 1, $fn = 16);   // 45-degree underside
    }
    for (sx = [-1, 1]) translate([sx*6, 27.3, 26]) rotate([-90, 0, 0]) cylinder(d = 5, h = 1.2, $fn = 32);
}

module limbs() {
    for (sx = [-1, 1]) {
        hull() {   // upper arm down the side
            translate([sx*26, -1, 27]) sphere(r = 5.5, $fn = 48);
            translate([sx*26.5, -17, 17.5]) sphere(r = 5.5, $fn = 48);
        }
        hull() {   // forearm across the front, hands meet on the lap
            translate([sx*26.5, -17, 17.5]) sphere(r = 5.5, $fn = 48);
            translate([sx*7, -25, 18.5]) sphere(r = 6, $fn = 48);
        }
        // leg + foot (flat underneath so it sits on the bed)
        intersection() {
            union() {
                hull() {
                    translate([sx*11, -10, 7.5]) sphere(r = 8.5, $fn = 48);
                    translate([sx*14.5, -27, 7.5]) sphere(r = 8.5, $fn = 48);
                }
                translate([sx*15, -29.5, 8.5]) sphere(r = 9.5, $fn = 48);
            }
            translate([-100, -100, 0]) cube([200, 200, 200]);
        }
    }
}

// skeleton: thin bones with knobby joints instead of the soft limbs
module bone(a, b, r = 2.7, k = 4.2) {
    hull() { translate(a) sphere(r = r, $fn = 24); translate(b) sphere(r = r, $fn = 24); }
    translate(a) sphere(r = k, $fn = 32); translate(b) sphere(r = k, $fn = 32);
}
module bone_limbs() {
    for (sx = [-1, 1]) {
        bone([sx*24, -1, 27], [sx*26, -17, 17.5]);
        bone([sx*26, -17, 17.5], [sx*8, -24.5, 18], 2.5, 4.6);
        intersection() {
            bone([sx*11, -12, 5.2], [sx*14.5, -30, 5.2], 3.4, 5.6);
            translate([-100, -100, 0]) cube([200, 200, 200]);
        }
    }
}
// ribs, sternum and spine as a raised relief (stepped underside prints clean)
module rib_relief() {
    module lift(d, z0, z1, front = true)
        intersection() {
            torso(-d);
            translate([-50, front ? -50 : 6, z0]) cube([100, front ? 54 : 50, z1 - z0]);
        }
    for (z = [14.5, 19.5, 24.5, 29.5]) difference() {
        union() { lift(1.3, z + 1.0, z + 2.8); lift(0.65, z + 0.3, z + 2.8); }
        translate([-1.2, -60, 0]) cube([2.4, 50, 60]);          // gap either side of the sternum
    }
    intersection() { torso(-1.6); translate([-2.4, -50, 13]) cube([4.8, 40, 20.5]); }      // sternum
    intersection() { torso(-1.5); difference() {                                           // spine
        translate([-2.8, 6, 12]) cube([5.6, 40, 23]);
        for (z = [15 : 3.6 : 34]) translate([-5, 0, z]) cube([10, 60, 0.9]);
    } }
}

// hollow with a 45-degree roof so it prints without support
module body_cavity() {
    zr = body_h - body_rt;                       // 24
    hx = sh_w/2 - body_wall; hy = sh_d/2 - body_wall;
    zt = body_h - body_wall;
    hull() {
        intersection() {
            torso(body_wall);
            translate([-100, -100, -2]) cube([200, 200, zr + 2]);
        }
        translate([0, 0, zt - 0.01])
            cube([2*(hx - (zt - zr)), 2*(hy - (zt - zr)), 0.02], center = true);
    }
}

module base_2d(g = 0) offset(r = body_rb - body_wall + g, $fn = 64)
    square([body_w - 2*body_rb, body_dp - 2*body_rb], center = true);
module base_cone(g = 0) hull() {
    translate([0, 0, -0.01]) linear_extrude(0.01) base_2d(base_seat + g);
    translate([0, 0, base_seat]) linear_extrude(0.01) base_2d(g);
}

usb_z    = plate_t + mcu_standoff + mcu_t + 1.6;   // USB-C centre height
wall_in_y = body_dp/2 - body_wall;                  // inner face of back wall
mcu_yb   = wall_in_y - usb_over;                    // PCB back edge

// open-bottom notch in the back wall, hidden at the base
module usb_notch_2d(g = 0) {
    hull() {
        for (s = [-1, 1]) translate([s*(usb_w - usb_h)/2, usb_z]) circle(d = usb_h + 2*g);
        translate([-(usb_w/2 + g) + 0.05, -2]) square([usb_w + 2*g - 0.1, usb_z + 2]);  // inset avoids a degenerate hull edge
    }
}

// the two posts that rise into the head, each with a tapered 45-degree rib
module post_slice(yl, p)
    translate([0, head_front_y + yl, head_cz]) rotate([90, 0, 0]) linear_extrude(0.01)
        polygon([[post_xi, key_zt - p], [post_xi - p, key_zt], [post_xi - p, post_top], [post_xi, post_top]]);
module neck_posts() for (m = [0, 1]) mirror([m, 0, 0]) {
    xo = neck_in_x + neck_wall;  z0 = head_bottom_z - 3 - head_cz;
    translate([0, head_front_y + post_y1, head_cz]) rotate([90, 0, 0]) linear_extrude(post_y1 - post_y0)
        polygon([[xo, z0], [neck_in_x, z0], [post_xi, z0 + (neck_in_x - post_xi)], [post_xi, post_top], [xo, post_top]]);
    hull() { post_slice(post_y0 + 0.01, nrib(post_y0)); post_slice(post_y1, nrib(post_y1)); }
}

// wedge key (head frame). Print it as drawn, flat side down.
module neck_key(dy = 0) {
    xv = post_xi - 0.25;  Rw = head_d/2 - wall;
    xb = sqrt(Rw*Rw - key_zb*key_zb) - 0.05;  xt = sqrt(Rw*Rw - key_zt*key_zt) - 0.05;   // on the inner wall
    xi = neck_in_x + neck_wall + 0.29;         // inner face of the outer prongs
    y_tip = post_y0 + 0.6;  y_bar = post_y1 + key_travel;  y_end = y_bar + 2.2;
    module sl(y, pts) translate([0, y, 0]) rotate([90, 0, 0]) linear_extrude(0.01) polygon(pts);
    module ex(ya, yb, pts) translate([0, yb, 0]) rotate([90, 0, 0]) linear_extrude(yb - ya) polygon(pts);
    function tongue(y) = let(p = nrib(y) - key_fat) [[-xv, key_zb], [xv, key_zb], [xv, key_zt - p + 0.25], [post_xi - p, key_zt],
                                           [-(post_xi - p), key_zt], [-xv, key_zt - p + 0.25]];
    pad   = [[xi, key_zb], [xb, key_zb], [xt, key_zt], [xi, key_zt]];
    lead  = [[xi, key_zb + 1.2], [xt - 1.5, key_zt], [xi, key_zt]];
    shank = [[xi, key_zb + 0.4], [xt - 0.98, key_zt], [xi, key_zt]];
    translate([0, dy, 0]) difference() {
        union() {
            // centre tongue: its bevelled edges go under the ribs; wider at the back = the wedge
            hull() { sl(y_tip, tongue(y_tip)); sl(y_end, tongue(y_end)); }
            for (m = [0, 1]) mirror([m, 0, 0]) {
                ex(y_tip + 1.2, y_tip + 4.8, pad);                         // pads that stand on the head's wall
                hull() { sl(y_tip + 0.01, lead); sl(y_tip + 1.21, pad); }  // lead-in
                ex(y_tip + 4.8, y_end, shank);                             // slimmer shank: passes the lip of the opening
            }
            ex(y_bar, y_end, [[-13.5, key_zb], [13.5, key_zb], [xt - 0.98, key_zt], [-(xt - 0.98), key_zt]]);   // cross-bar
        }
        // pull slot: hook it with a small screwdriver to draw the key out
        translate([-3, post_y1 + 0.3, key_zb - 1]) cube([6, key_travel - 0.3, 8]);
    }
}

// style: "bare" (template), "hoodie", "cat" (hoodie + tail),
//        "astro" (suit collar + backpack), "skeleton" (bones + rib relief)
module body(style = "hoodie") {
    plain = style == "bare" || style == "skeleton";
    difference() {
        union() {
            torso();
            if (style == "skeleton") { bone_limbs(); rib_relief(); } else limbs();
            if (!plain) collar();
            if (style == "hoodie" || style == "cat") hood_bag();
            if (style == "cat") cat_tail();
            if (style == "astro") backpack();
            neck_box(neck_wall, body_h - 6, head_bottom_z + neck_plug);
            neck_box(neck_wall + neck_fit, head_bottom_z - 2, head_bottom_z + neck_plug);   // snug plug
            // rest block behind the neck: the rear of the head's flat floor sits on it
            translate([0, neck_y1b + neck_wall, body_h - 8]) linear_extrude(head_bottom_z - rest_gap - (body_h - 8))
                offset(r = 1.5) offset(delta = -1.5) translate([-14.4, 0]) square([28.8, head_front_y + 25.6 - neck_y1b - neck_wall]);
        }
        body_cavity();
        base_cone();                                                    // conical seat for the base plate
        translate([0, 0, -50]) cube([200, 200, 100], center = true);   // flat base
        neck_box(0, body_h - 15, head_bottom_z + neck_plug + 1);         // wire channel
        // USB-C access
        xz_extrude(wall_in_y - 0.5, 10) usb_notch_2d();
    }
    neck_posts();
    // catch ribs for the base plate's snap teeth (45-degree underside: no support)
    for (m = [0, 1]) mirror([m, 0, 0]) translate([0, 3.5, 0]) rotate([90, 0, 0]) linear_extrude(7)
        polygon([[25, rib_z - 0.65 - (25 - rib_x)], [rib_x, rib_z - 0.65], [rib_x, rib_z], [25, rib_z]]);
}

// cover for the USB notch (optional). Push it into the notch from outside, after the base
// plate: it clicks in. A slit inside each side makes that side a spring strip, rooted at the
// top corner, with a tooth near its bottom that catches behind the wall beside the notch.
// The tooth's catch is at 45 degrees and keeps the strip bent by ucv_pre, so the cover is
// pulled in onto the plate's rim and does not rattle. Pull it out at the nail slot.
// Prints outer face down: a flat outline, only the teeth have (45-degree) undersides.
ucv_clr   = 0.12;   // gap around the cover in the notch
ucv_strip = 0.8;    // width of the spring strips
ucv_slit  = 0.6;
ucv_bite  = 0.3;    // how far the teeth reach behind the wall
ucv_pre   = 0.1;    // the strips stay bent by this much when the cover is in
ucv_tz    = [plate_t + 0.3, plate_t + 1.8];   // teeth: above the plate, below the board
ucv_yi    = wall_in_y + 0.2;                   // inner face: clear of the USB receptacle

module ucv_2d(g = 0) intersection() { offset(delta = g - ucv_clr) usb_notch_2d(); translate([-50, 0.3]) square([100, 50]); }
// slit inside the right-hand strip: open at the bottom edge, up the side and round the top
// corner to 45 degrees, where the strip is rooted
module ucv_slit_2d() intersection() {
    difference() { ucv_2d(-ucv_strip); ucv_2d(-ucv_strip - ucv_slit); }
    polygon([[(usb_w - usb_h)/2, -1], [20, -1], [20, usb_z + 20 - (usb_w - usb_h)/2], [(usb_w - usb_h)/2, usb_z]]);
}
module usb_cover() {
    xs = usb_w/2 - ucv_clr;  xt = usb_w/2 + ucv_bite;  xc = usb_w/2 + ucv_pre;
    difference() {
        union() {
            xz_extrude(ucv_yi, body_dp/2 - ucv_yi) difference() { ucv_2d(); mir() ucv_slit_2d(); }
            // teeth on the strips' inner ends: lead-in, tip, 45-degree catch
            for (m = [0, 1]) mirror([m, 0, 0]) translate([0, 0, ucv_tz[0]]) linear_extrude(ucv_tz[1] - ucv_tz[0])
                polygon([[xs - ucv_strip, wall_in_y - 1], [xs, wall_in_y - 1], [xt, wall_in_y - 0.4],
                         [xt, wall_in_y - (xt - xc)], [xs, wall_in_y + (xc - xs)], [xs, ucv_yi + 0.1], [xs - ucv_strip, ucv_yi + 0.1]]);
        }
        base_cone(0.08);
        // nail slot: a 45-degree notch in the bottom edge
        translate([-2.5, 0, 0]) rotate([90, 0, 90]) linear_extrude(5)
            polygon([[body_dp/2 - 1.4, 0], [body_dp/2 + 1, 0], [body_dp/2 + 1, 2.4]]);
    }
}

module base_plate() {
    difference() {
        union() {
            hull() {   // conical edge, matches the seat in the body
                linear_extrude(0.01) base_2d(base_seat - 0.1);
                translate([0, 0, base_seat]) linear_extrude(0.01) base_2d(-base_clr);
            }
            translate([0, 0, base_seat]) linear_extrude(plate_t - base_seat) base_2d(-base_clr);
            // snap beams: bridges between two posts, tooth in the middle
            for (m = [0, 1]) mirror([m, 0, 0]) {
                xb = rib_x - 0.75;   zb = rib_z + base_play - 0.75;
                for (sy = [-1, 1]) translate([xb - 1.85, sy*11.75 - 1.25, plate_t - 0.01]) cube([1.85, 2.5, zb + 3.75 - plate_t]);
                translate([xb - 0.9, -11, zb - 0.05]) cube([0.9, 22, 3.8]);
                translate([0, 3, 0]) rotate([90, 0, 0]) linear_extrude(6)
                    polygon([[xb - 0.05, zb], [rib_x + base_bite, zb + 0.75 + base_bite], [rib_x + base_bite, zb + 1.05 + base_bite], [xb - 0.05, zb + 3.75]]);
            }
        }
        // notches that let the plate pass the catch ribs
        for (m = [0, 1]) mirror([m, 0, 0]) translate([rib_x - 0.9, -4.5, -1]) cube([8, 9, 1 + plate_t + 0.01]);
        // pull slot: hook a fingertip or a tool here to unclip the plate
        hull() for (sx = [-1, 1]) translate([sx*4, -12, -1]) cylinder(d = 6, h = 6, $fn = 32);
        // slots that free the cradle's sprung fingers (open at the back)
        for (m = [0, 1]) mirror([m, 0, 0]) translate([mcu_w/2 + mcu_clr - 0.05, mcu_yb - 9, -1]) cube([2.15, 20, plate_t + 1.01]);
    }
    translate([0, 0, plate_t]) mcu_cradle();
}

// cradle for the SuperMini (on the plate's top face). The board slides in from the back,
// antenna end first, along a groove in each side wall: a ledge under its edge and a
// 45-degree roof over it, so it cannot lift. A rigid stop takes the push when a cable is
// plugged in. At the back the walls turn into sprung fingers (free in slots in the plate)
// whose hooks snap in behind the board's corners and take the pull when it is unplugged.
// To take the board out, spread the fingers and slide it back. Nothing touches the board
// except its end faces and the outer mcu_edge of its long edges, so wires can be soldered
// to every pin. No bridges: the fingers stand on the bed, the hooks' undersides are 45 degrees.
module mcu_cradle() {
    y0 = mcu_yb - mcu_l;                          // front edge of the board
    xg = mcu_w/2 + mcu_clr;                       // back of the grooves
    xl = mcu_w/2 - mcu_edge;                      // inner edge of the ledges
    xr = xl + 0.25;                               // inner edge of the roofs
    zb = mcu_standoff;  zt = mcu_standoff + mcu_t + mcu_clr;   // groove floor and roof
    wt = zt + 0.9;                                // wall height
    yf = mcu_yb - 9;                              // the rigid walls end, the fingers begin
    xf = xg + 0.3;                                // inner face of the fingers
    yh = mcu_yb + mcu_clr;                        // the hooks' catch face
    for (m = [0, 1]) mirror([m, 0, 0]) {
        xz_extrude(y0 - 1.7, yf - (y0 - 1.7))
            polygon([[xl, 0], [xg + 1.6, 0], [xg + 1.6, wt], [xr, wt], [xr, zt + xg - xr], [xg, zt], [xg, zb], [xl, zb]]);
        xz_extrude(yf - 0.5, mcu_yb - yf + 0.5) polygon([[xl, 0], [xg - 0.1, 0], [xg - 0.1, zb], [xl, zb]]);   // ledge
        translate([xf, yf - 1, -plate_t]) cube([1, yh + 0.7 - yf + 1, wt + plate_t]);                         // finger
        intersection() {                                                                                      // hook
            translate([0, 0, -plate_t]) linear_extrude(wt + plate_t)
                polygon([[xf + 0.01, yh], [mcu_w/2 - mcu_hook, yh], [mcu_w/2 - mcu_hook, yh + 0.1],
                         [mcu_w/2, yh + 0.1 + mcu_hook], [xf + 0.01, yh + 0.1 + mcu_hook]]);
            xz_extrude(yh - 1, 3) polygon([[mcu_w/2 - mcu_hook - 0.5, zb + 0.4], [xf + 1, zb - 0.1 - (xf + 1 - (mcu_w/2 - mcu_hook))],
                                           [xf + 1, wt + 1], [mcu_w/2 - mcu_hook - 0.5, wt + 1]]);
        }
    }
    // front stop (antenna end)
    translate([-(xg + 1.6), y0 - 1.7, 0]) cube([2*(xg + 1.6), 1.7 - mcu_clr, zt + 0.5]);
}

// stand-in for the SuperMini (preview only)
module mcu_dummy() {
    translate([-mcu_w/2, mcu_yb - mcu_l, plate_t + mcu_standoff]) {
        color("#1a1a1a") cube([mcu_w, mcu_l, mcu_t]);
        color("#bbbbbb") translate([mcu_w/2 - 4.47, mcu_l - 7.3 + usb_over, mcu_t]) cube([8.94, 7.3, 3.2]);
    }
}

// ============================================================
//  output
// ============================================================
module screen_dummy() {
    color("#080808") translate([0, lip, screen_off_z])
        rotate([-90, 0, 0]) cylinder(d = 35.6, h = tft_t);
    color("#1d5c2e") xz_extrude(lip + tft_t, pcb_t) translate([0, screen_off_z]) {
        circle(d = pcb_d);
        translate([-tab_w/2, -tab_below]) square([tab_w, tab_below]);
    }
}

module show(print_rot = [0, 0, 0]) { if (placed) children(); else rotate(print_rot) children(); }

if (part == "assembly") {
    color("#f2f0ea") place_head() head_shell();
    color("#e6e4de") place_head() head_cap();
    place_head() screen_dummy();
    color("#e0a11b") place_head() neck_key(key_pos);
    color("#2b2b2b") { band(); cup(1); cup(-1); }
    color("#e8553a") body();
    color("#e8553a") usb_cover();
    color("#444") base_plate();
    mcu_dummy();
}
// print orientation unless placed = true (no drop to the bed: slicers do that)
else if (part == "head_shell")  show([90, 0, 0])  place_head() head_shell();
else if (part == "head_cap")    show([-90, 0, 0]) place_head() head_cap();
else if (part == "band_plain")  show([-90, 0, 0]) band("plain");
else if (part == "band_cat")    show([-90, 0, 0]) band("cat");
else if (part == "band_bug")    show([-90, 0, 0]) band("bug");
else if (part == "cup_right")   show([0, 90, 0])  cup(1);
else if (part == "cup_left")    show([0, -90, 0]) cup(-1);
else if (part == "pod_right")   show([0, 90, 0])  pod(1);
else if (part == "pod_left")    show([0, -90, 0]) pod(-1);
else if (part == "body_bare")     body("bare");
else if (part == "body_skeleton") body("skeleton");
else if (part == "band_bear")     show([-90, 0, 0]) band("bear");
else if (part == "band_bunny")    show([-90, 0, 0]) band("bunny");
else if (part == "band_devil")    show([-90, 0, 0]) band("devil");
else if (part == "band_crown")    show([-90, 0, 0]) band("crown");
else if (part == "band_dino")     show([-90, 0, 0]) band("dino");
else if (part == "band_unicorn")  show([-90, 0, 0]) band("unicorn");
else if (part == "cup_mic")       show([0, -90, 0]) cup_mic();
else if (part == "plug")          show([0, -90, 0]) plug();
else if (part == "neck_key")      place_head() neck_key(placed ? key_pos : 0);
else if (part == "body_hoodie") body("hoodie");
else if (part == "body_cat")    body("cat");
else if (part == "body_astro")  body("astro");
else if (part == "base")        base_plate();
else if (part == "usb_cover")   show([-90, 0, 0]) usb_cover();   // outer face down
else if (part == "screen")      place_head() screen_dummy();
else if (part == "mcu")         mcu_dummy();

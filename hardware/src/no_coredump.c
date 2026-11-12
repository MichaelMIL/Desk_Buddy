/* The precompiled ESP-IDF in the Arduino core writes a core dump to the
 * "coredump" partition on every crash (~11 KB of code). Nothing in this
 * project reads it, so these empty definitions stand in for the two entry
 * points (startup and panic handler) and the linker leaves the writer out.
 * A crash still prints its backtrace on the serial console and reboots.
 * To get core dumps back, delete this file. */
void esp_core_dump_init(void) {}
void esp_core_dump_to_flash(void *info) { (void)info; }

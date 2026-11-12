# PlatformIO post-script: keeps the firmware inside its 1 MB OTA slot.
#
# 1. printf family from the chip ROM. The Arduino core links newlib's full
#    printf four times over (vfprintf, svfprintf and their integer twins,
#    ~50 KB). ESP-IDF's CONFIG_NEWLIB_NANO_FORMAT instead takes printf/vfprintf
#    from the ESP32-S3 ROM and sprintf/snprintf from libc_nano; this does the
#    same. Cost: no %f and no %ll in printf formats (use %lu / String()).
# 2. No ESP Insights log hooks. The core wraps esp_log_write / log_printf so
#    ESP Insights can see logs, which links esp_diagnostics. Nothing uses it.
#
# The other size settings are build flags in platformio.ini (no C++ unwind
# tables, NimBLE roles and pairing) and src/no_coredump.c.
Import("env")

env.Append(LINKFLAGS=["--specs=nano.specs", "-Wl,-T,esp32s3.rom.newlib-nano.ld"])
for flag in ("-Wl,--wrap=esp_log_write", "-Wl,--wrap=esp_log_writev", "-Wl,--wrap=log_printf"):
    while flag in env["LINKFLAGS"]:
        env["LINKFLAGS"].remove(flag)

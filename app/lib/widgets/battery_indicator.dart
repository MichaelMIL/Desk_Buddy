import 'package:flutter/material.dart';

/// The buddy's battery in the app bar: an icon that empties with the charge
/// and the percentage, in the error colour while the buddy reports it low
/// (unless it is on the charger), with a bolt while charging.
/// Nothing at all when [percent] is null (no battery, or older firmware).
class BatteryIndicator extends StatelessWidget {
  const BatteryIndicator({
    super.key,
    required this.percent,
    required this.low,
    this.charging = false,
    this.charged = false,
  });

  final int? percent;
  final bool low, charging, charged;

  /// Material's battery glyphs: charging, full, 6 to 0 bars, and an alert for low.
  static IconData iconFor(int percent, {required bool low, bool charging = false, bool charged = false}) {
    if (charging) return Icons.battery_charging_full_rounded;
    if (charged) return Icons.battery_full_rounded;
    if (low) return Icons.battery_alert_rounded;
    if (percent >= 95) return Icons.battery_full_rounded;
    const bars = [
      Icons.battery_0_bar_rounded,
      Icons.battery_1_bar_rounded,
      Icons.battery_2_bar_rounded,
      Icons.battery_3_bar_rounded,
      Icons.battery_4_bar_rounded,
      Icons.battery_5_bar_rounded,
      Icons.battery_6_bar_rounded,
    ];
    return bars[(percent.clamp(0, 100) * 7 ~/ 100).clamp(0, 6)];
  }

  @override
  Widget build(BuildContext context) {
    final p = percent;
    if (p == null) return const SizedBox.shrink();
    final cs = Theme.of(context).colorScheme;
    final alert = low && !charging && !charged;
    final color = alert ? cs.error : cs.onSurfaceVariant;
    final tip = charging
        ? 'Battery $p %, charging'
        : charged
            ? 'Battery charged ($p %)'
            : alert
                ? 'Battery low ($p %): charge the buddy'
                : 'Battery $p %';
    return Tooltip(
      message: tip,
      child: Semantics(
        label: tip.replaceAll(' %', ' percent'),
        excludeSemantics: true,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(iconFor(p, low: low, charging: charging, charged: charged), size: 20, color: color),
              const SizedBox(width: 2),
              Text(
                '$p%',
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: color,
                      fontWeight: alert ? FontWeight.w600 : null,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

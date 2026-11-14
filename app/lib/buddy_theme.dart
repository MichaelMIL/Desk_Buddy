/// Colors for the buddy's themes. The app takes on the color of the theme
/// the buddy has selected, and each theme's faces are framed in its color.
library;

import 'package:flutter/material.dart';

/// The app's own blue (the simulator's remote page), for no theme.
const buddyBlue = Color(0xFF4FB3FF);

const _colors = <String, Color>{
  'bear': Color(0xFFC08552),
  'bee': Color(0xFFFFC21A),
  'birthday': Color(0xFFFF6FB5),
  'builder': Color(0xFFFFB000),
  'bunny': Color(0xFFFF9EC9),
  'cat': Color(0xFFFF9D4D),
  'claude': Color(0xFFD97757),
  'claudecode': Color(0xFFD97757),
  'devil': Color(0xFFE5484D),
  'dj': Color(0xFF00D5FF),
  'dragon': Color(0xFF3CCB7F),
  'gamer': Color(0xFF8E7CFF),
  'hacker': Color(0xFF39E66B),
  'halloween': Color(0xFFFF7A1A),
  'king': Color(0xFFFFCB45),
  'ocean': Color(0xFF2C9CFF),
  'robot': Color(0xFF8FA6B8),
  'rude': Color(0xFFFF7448),
  'scientist': Color(0xFF2EC4D6),
  'skeleton': Color(0xFFD9D4C7),
  'space': Color(0xFF8B6CFF),
  'spicy': Color(0xFFFF4D2E),
  'stpatricks': Color(0xFF2FBF4A),
  'summer': Color(0xFFFFB22E),
  'template': Color(0xFF9AA7B5),
  'unicorn': Color(0xFFD27BFF),
  'valentine': Color(0xFFFF4F8B),
  'xmas': Color(0xFFE5484D),
};

/// The theme's color; one without its own gets a steady hue from its name.
Color themeColor(String theme) {
  if (theme.isEmpty) return buddyBlue;
  final c = _colors[theme];
  if (c != null) return c;
  final hue = theme.codeUnits.fold<int>(7, (h, u) => (h * 31 + u) & 0xFFFF) % 360;
  return HSLColor.fromAHSL(1, hue.toDouble(), 0.7, 0.6).toColor();
}

/// Black or white, whichever reads on [c].
Color onColor(Color c) => ThemeData.estimateBrightnessForColor(c) == Brightness.dark ? Colors.white : Colors.black;

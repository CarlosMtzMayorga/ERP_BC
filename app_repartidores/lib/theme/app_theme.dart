import 'package:flutter/material.dart';

class AppColors {
  static const Color primary = Color(0xFFDC2626);
  static const Color primaryDark = Color(0xFFB91C1C);
  static const Color secondary = Color(0xFF2563EB);
  static const Color accent = Color(0xFFD97706);
  static const Color success = Color(0xFF059669);
  static const Color warning = Color(0xFFEA580C);
  static const Color danger = Color(0xFFEF4444);
  static const Color error = Color(0xFFEF4444);

  // Paleta AMOLED
  static const Color background = Color(0xFF0B1120);
  static const Color surface = Color(0xFF1E293B);
  static const Color card = Color(0xFF162032);
  static const Color border = Color(0xFF334155);

  static const Color textPrimary = Color(0xFFF8FAFC);
  static const Color textSecondary = Color(0xFF94A3B8);
}

class AppTheme {
  static const Color primaryRed = AppColors.primary;
  static const Color primaryDarkRed = AppColors.primaryDark;
  static const Color accentAmber = AppColors.accent;
  static const Color successGreen = AppColors.success;
  static const Color warningOrange = AppColors.warning;
  static const Color errorRed = AppColors.error;

  static const Color bgDark = AppColors.background;
  static const Color surfaceDark = AppColors.surface;
  static const Color cardDark = AppColors.card;
  static const Color borderDark = AppColors.border;

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: bgDark,
      colorScheme: const ColorScheme.dark(
        primary: primaryRed,
        secondary: accentAmber,
        surface: surfaceDark,
        error: errorRed,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: Colors.white,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: bgDark,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.3,
        ),
      ),
      cardTheme: CardThemeData(
        color: cardDark,
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: borderDark, width: 1),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primaryRed,
          foregroundColor: Colors.white,
          elevation: 4,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.3,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: Colors.white,
          side: const BorderSide(color: borderDark, width: 1.5),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceDark,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: borderDark),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: borderDark),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: primaryRed, width: 2),
        ),
        labelStyle: const TextStyle(color: Colors.white70, fontSize: 13),
        hintStyle: const TextStyle(color: Colors.white38, fontSize: 13),
      ),
    );
  }
}

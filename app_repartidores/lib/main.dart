import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'services/storage_service.dart';
import 'screens/login_screen.dart';
import 'screens/dashboard_screen.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Configurar barra de estado transparente y estilo oscuro
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppColors.surface,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  // Verificar si ya existe una sesión guardada
  final sessionCookie = await StorageService.getSessionCookie();
  final usuario = await StorageService.getUsuario();
  final bool sesionActiva = sessionCookie != null && sessionCookie.isNotEmpty && usuario != null;

  runApp(BCRepartidoresApp(sesionActiva: sesionActiva));
}

class BCRepartidoresApp extends StatelessWidget {
  final bool sesionActiva;

  const BCRepartidoresApp({Key? key, required this.sesionActiva}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BC Repartidores',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: sesionActiva ? const DashboardScreen() : const LoginScreen(),
    );
  }
}


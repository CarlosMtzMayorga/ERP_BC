import 'package:flutter/material.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';
import 'config_servidor_screen.dart';
import 'dashboard_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({Key? key}) : super(key: key);

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usuarioController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _cargando = false;
  String? _serverUrl;

  @override
  void initState() {
    super.initState();
    _cargarDatosGuardados();
  }

  Future<void> _cargarDatosGuardados() async {
    final server = await StorageService.getServerUrl();
    final usuario = await StorageService.getUsuario();
    if (mounted) {
      setState(() {
        _serverUrl = server;
        if (usuario != null && usuario.isNotEmpty) {
          _usuarioController.text = usuario;
        } else {
          _usuarioController.text = 'admin';
        }
      });
    }
  }

  Future<void> _iniciarSesion() async {
    final usuario = _usuarioController.text.trim();
    final pass = _passwordController.text;

    if (usuario.isEmpty || pass.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Por favor ingresa usuario y contraseña'),
          backgroundColor: Colors.amber.shade800,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    setState(() => _cargando = true);

    final res = await ApiService.login(usuario: usuario, password: pass);

    if (!mounted) return;
    setState(() => _cargando = false);

    if (res.success) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const DashboardScreen()),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res.error ?? 'Error de autenticación'),
          backgroundColor: const Color(0xFFDC2626),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9), // Slate 100 igual al fondo web
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Tarjeta Principal idéntica al formulario de http://localhost:5000/
                Container(
                  constraints: const BoxConstraints(maxWidth: 440),
                  padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: const Color(0xFFE2E8F0), width: 1),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x120F172A),
                        blurRadius: 28,
                        offset: Offset(0, 10),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Encabezado de marca con Logo de BC Refaccionarias
                      Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          margin: const EdgeInsets.only(bottom: 18),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: const Color(0xFFF1F5F9)),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x0A000000),
                                blurRadius: 10,
                                offset: Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Image.asset(
                            'assets/logo.png',
                            height: 62,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFDC2626),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: const Icon(Icons.directions_car, color: Colors.white, size: 24),
                                ),
                                const SizedBox(width: 8),
                                const Text(
                                  'BC REFACCIONARIAS',
                                  style: TextStyle(
                                    color: Color(0xFF0F172A),
                                    fontWeight: FontWeight.w900,
                                    fontSize: 16,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),

                      // Título y Subtítulo
                      const Text(
                        'Iniciar Sesión',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFF0F172A),
                          letterSpacing: -0.5,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Ingresa tus credenciales autorizadas del sistema',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: Color(0xFF64748B),
                        ),
                      ),
                      const SizedBox(height: 28),

                      // Campo USUARIO
                      const Text(
                        'USUARIO',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF334155),
                          letterSpacing: 0.8,
                        ),
                      ),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _usuarioController,
                        style: const TextStyle(
                          color: Color(0xFF0F172A),
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Nombre de usuario',
                          hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                          prefixIcon: const Icon(Icons.person_outline_rounded, color: Color(0xFF94A3B8), size: 20),
                          filled: true,
                          fillColor: Colors.white,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(color: Color(0xFFCBD5E1), width: 1.2),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(color: Color(0xFFDC2626), width: 2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),

                      // Campo CONTRASEÑA
                      const Text(
                        'CONTRASEÑA',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF334155),
                          letterSpacing: 0.8,
                        ),
                      ),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        style: const TextStyle(
                          color: Color(0xFF0F172A),
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                        onSubmitted: (_) => _iniciarSesion(),
                        decoration: InputDecoration(
                          hintText: '••••••••',
                          hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                          prefixIcon: const Icon(Icons.lock_outline_rounded, color: Color(0xFF94A3B8), size: 20),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                              color: const Color(0xFF94A3B8),
                              size: 20,
                            ),
                            onPressed: () {
                              setState(() => _obscurePassword = !_obscurePassword);
                            },
                          ),
                          filled: true,
                          fillColor: Colors.white,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(color: Color(0xFFCBD5E1), width: 1.2),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(color: Color(0xFFDC2626), width: 2),
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),

                      // Botón Ingresar al Sistema ->
                      ElevatedButton(
                        onPressed: _cargando ? null : _iniciarSesion,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFDC2626),
                          foregroundColor: Colors.white,
                          elevation: 3,
                          shadowColor: const Color(0x60DC2626),
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: _cargando
                            ? const SpinKitThreeBounce(color: Colors.white, size: 22)
                            : const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    'Ingresar al Sistema',
                                    style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.3,
                                    ),
                                  ),
                                  SizedBox(width: 8),
                                  Icon(Icons.arrow_forward_rounded, size: 18),
                                ],
                              ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 22),

                // Indicador de Servidor Activo (como en el footer web)
                InkWell(
                  onTap: () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const ConfigServidorScreen()),
                    );
                    _cargarDatosGuardados();
                  },
                  borderRadius: BorderRadius.circular(20),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x08000000),
                          blurRadius: 8,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: Color(0xFF10B981), // Emerald green pulse
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Servidor: ${_serverUrl ?? "http://192.168.1.12:5000"}',
                          style: const TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(width: 6),
                        const Icon(Icons.settings_outlined, size: 14, color: Color(0xFF94A3B8)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

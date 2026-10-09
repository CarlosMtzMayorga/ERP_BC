class CajaItem {
  final String clave;
  final String nombre;
  final double unidades;

  CajaItem({
    required this.clave,
    required this.nombre,
    required this.unidades,
  });

  factory CajaItem.fromJson(Map<String, dynamic> json) {
    return CajaItem(
      clave: json['clave']?.toString() ?? '',
      nombre: json['nombre']?.toString() ?? '',
      unidades: (json['unidades'] as num?)?.toDouble() ?? 1.0,
    );
  }
}

class Caja {
  final int id;
  final int embarqueId;
  final String folioCaja;
  final int numeroCaja;
  final double piezasEnCaja;
  final String estatus;
  final String? destino;
  final String? recolectadoPor;
  final String? recolectadoEn;
  final String? recibidoPor;
  final String? recibidoEn;
  final List<CajaItem> detalles;

  Caja({
    required this.id,
    required this.embarqueId,
    required this.folioCaja,
    required this.numeroCaja,
    required this.piezasEnCaja,
    required this.estatus,
    this.destino,
    this.recolectadoPor,
    this.recolectadoEn,
    this.recibidoPor,
    this.recibidoEn,
    this.detalles = const [],
  });

  bool get estaEnTransito => estatus == 'EN_TRANSITO';
  bool get estaRecibida => estatus == 'RECIBIDA';
  bool get estaEmpacada => estatus == 'EMPACADA';

  factory Caja.fromJson(Map<String, dynamic> json) {
    var rawDetalles = json['detalles'] as List? ?? [];
    return Caja(
      id: json['id'] is int ? json['id'] : int.tryParse(json['id'].toString()) ?? 0,
      embarqueId: json['embarque_id'] is int ? json['embarque_id'] : int.tryParse(json['embarque_id']?.toString() ?? '') ?? 0,
      folioCaja: json['folio_caja']?.toString() ?? '',
      numeroCaja: json['numero_caja'] is int ? json['numero_caja'] : int.tryParse(json['numero_caja']?.toString() ?? '') ?? 1,
      piezasEnCaja: (json['piezas_en_caja'] as num?)?.toDouble() ?? 0.0,
      estatus: json['estatus']?.toString() ?? 'EMPACADA',
      destino: json['destino']?.toString(),
      recolectadoPor: json['recolectado_por']?.toString(),
      recolectadoEn: json['recolectado_en']?.toString(),
      recibidoPor: json['recibido_por']?.toString(),
      recibidoEn: json['recibido_en']?.toString(),
      detalles: rawDetalles.map((d) => CajaItem.fromJson(d)).toList(),
    );
  }
}


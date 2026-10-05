jest.mock('../services/tenantResolverService', () => ({ listActiveTenants: jest.fn() }));
jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn() }));
jest.mock('../services/tenantModelService', () => ({ getTenantModel: jest.fn() }));

const {
  validarArgs,
  obtenerRangoDiaCaracas,
  evaluarCandidata,
  construirReversion
} = require('../scripts/revertir_recargos_fecha');

function crearMensualidad(overrides = {}) {
  return {
    id_alumno: {},
    monto_sin_recargo_usd: 50,
    recargo_aplicado_usd: 5,
    monto_con_recargo_usd: 55,
    monto_esperado: 55,
    ...overrides
  };
}

describe('revertir_recargos_fecha', () => {
  test('calcula el dia completo usando America/Caracas', () => {
    const rango = obtenerRangoDiaCaracas('2026-10-05');

    expect(rango.inicio.toISOString()).toBe('2026-10-05T04:00:00.000Z');
    expect(rango.fin.toISOString()).toBe('2026-10-06T04:00:00.000Z');
    expect(rango.mes).toBe(10);
    expect(rango.anio).toBe(2026);
  });

  test('exige alcance y fecha explicitos', () => {
    expect(() => validarArgs({
      fecha: null,
      allTenants: true,
      tenantId: null,
      diaVencimiento: 5,
      setDiasGracia: null
    })).toThrow('--fecha=AAAA-MM-DD');

    expect(() => validarArgs({
      fecha: '2026-10-05',
      allTenants: false,
      tenantId: null,
      diaVencimiento: 5,
      setDiasGracia: null
    })).toThrow('--all-tenants');
  });

  test('acepta un snapshot consistente y restaura solo los campos de recargo', () => {
    const evaluacion = evaluarCandidata(crearMensualidad());

    expect(evaluacion).toEqual({ elegible: true, montoBase: 50, recargo: 5 });
    expect(construirReversion(evaluacion.montoBase)).toEqual({
      $set: {
        aplica_recargo: false,
        monto_esperado: 50,
        monto_con_recargo_usd: 50,
        recargo_aplicado_usd: 0
      },
      $unset: { fecha_aplicacion_recargo: 1 }
    });
  });

  test('omite mensualidades con pagos posteriores', () => {
    expect(evaluarCandidata(crearMensualidad(), 1)).toEqual({
      elegible: false,
      motivo: 'tiene 1 pago(s) registrado(s) despues del recargo'
    });
  });

  test('omite montos modificados y alumnos con dia personalizado', () => {
    expect(evaluarCandidata(crearMensualidad({ monto_esperado: 54 })).elegible).toBe(false);
    expect(evaluarCandidata(crearMensualidad({
      id_alumno: { dia_limite_personalizado: 5 }
    })).elegible).toBe(false);
  });
});
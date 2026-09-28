jest.mock('../models/Mensualidad', () => ({}));
jest.mock('../models/Alumno', () => ({}));
jest.mock('../models/Sede', () => ({}));
jest.mock('../models/Reposo', () => ({}));
jest.mock('../models/PagoDetalle', () => ({}));
jest.mock('../models/TenantConfig', () => ({}));
jest.mock('../models/Representante', () => ({}));
jest.mock('../models/HistorialEstadoAlumno', () => ({}));

const {
  actualizarRetrasadosCore,
  aplicarRecargoMensualidadSegunConfig
} = require('../controllers/mensualidadController');

const COBRO_GLOBAL = {
  dia_cobro: 1,
  dia_vencimiento: 5,
  dias_gracia: 0,
  recargo_usd: 5
};

function crearMensualidad(overrides = {}, alumnoOverrides = {}) {
  return {
    _id: 'm1',
    id_alumno: {
      _id: 'a1',
      aplicar_recargo_mensualidad: true,
      tipo_mensualidad: 'monto_sede',
      fecha_inscripcion: new Date('2026-01-15T12:00:00.000Z'),
      sede: { _id: 's1', usar_recargo_global: true },
      ...alumnoOverrides
    },
    mes: 9,
    anio: 2026,
    estatus: 'Pendiente',
    monto_esperado: 50,
    monto_sin_recargo_usd: 50,
    recargo_aplicado_usd: 0,
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
}

async function aplicar(mensualidad, options = {}) {
  return aplicarRecargoMensualidadSegunConfig(mensualidad, {
    cobroConfig: COBRO_GLOBAL,
    fechaReferencia: new Date('2026-09-10T04:10:00.000Z'),
    ...options
  });
}

describe('aplicarRecargoMensualidadSegunConfig', () => {
  test('usa el recargo global cuando la sede hereda la configuracion', async () => {
    const mensualidad = crearMensualidad();

    const resultado = await aplicar(mensualidad);

    expect(resultado.aplicado).toBe(true);
    expect(mensualidad.recargo_aplicado_usd).toBe(5);
    expect(mensualidad.monto_con_recargo_usd).toBe(55);
    expect(mensualidad.monto_esperado).toBe(55);
    expect(mensualidad.save).toHaveBeenCalledTimes(1);
  });

  test('lee el recargo global desde TenantConfig cuando no se suministra cobroConfig', async () => {
    const mensualidad = crearMensualidad();
    const TenantConfig = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            cobro: { ...COBRO_GLOBAL, recargo_usd: 6 }
          })
        })
      })
    };

    const resultado = await aplicarRecargoMensualidadSegunConfig(mensualidad, {
      models: { TenantConfig },
      fechaReferencia: new Date('2026-09-10T04:10:00.000Z')
    });

    expect(resultado.aplicado).toBe(true);
    expect(TenantConfig.findOne).toHaveBeenCalledWith({ key: 'default' });
    expect(mensualidad.recargo_aplicado_usd).toBe(6);
    expect(mensualidad.monto_esperado).toBe(56);
  });

  test('prioriza el recargo propio de la sede sobre el global', async () => {
    const mensualidad = crearMensualidad({}, {
      sede: { _id: 's1', usar_recargo_global: false, recargo_usd: 7 }
    });

    await aplicar(mensualidad);

    expect(mensualidad.recargo_aplicado_usd).toBe(7);
    expect(mensualidad.monto_esperado).toBe(57);
  });

  test('resuelve el recargo de una sede no poblada usando el modelo del tenant', async () => {
    const mensualidad = crearMensualidad({}, { sede: 's1' });
    const Sede = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ _id: 's1', usar_recargo_global: false, recargo_usd: 8 })
        })
      })
    };

    await aplicar(mensualidad, { models: { Sede } });

    expect(Sede.findById).toHaveBeenCalledWith('s1');
    expect(mensualidad.recargo_aplicado_usd).toBe(8);
    expect(mensualidad.monto_esperado).toBe(58);
  });

  test('aplica desde el inicio del dia limite personalizado', async () => {
    const antes = crearMensualidad({}, { dia_limite_personalizado: 10 });
    const enElDia = crearMensualidad({}, { dia_limite_personalizado: 10 });

    const resultadoAntes = await aplicar(antes, {
      fechaReferencia: new Date('2026-09-10T03:59:59.999Z')
    });
    const resultadoEnElDia = await aplicar(enElDia, {
      fechaReferencia: new Date('2026-09-10T04:00:00.000Z')
    });

    expect(resultadoAntes.aplicado).toBe(false);
    expect(antes.save).not.toHaveBeenCalled();
    expect(resultadoEnElDia.aplicado).toBe(true);
    expect(enElDia.save).toHaveBeenCalledTimes(1);
  });

  test('respeta los dias de gracia del recargo global', async () => {
    const antes = crearMensualidad();
    const despues = crearMensualidad();
    const cobroConfig = { ...COBRO_GLOBAL, dias_gracia: 2 };

    const resultadoAntes = await aplicar(antes, {
      cobroConfig,
      fechaReferencia: new Date('2026-09-07T03:59:59.999Z')
    });
    const resultadoDespues = await aplicar(despues, {
      cobroConfig,
      fechaReferencia: new Date('2026-09-07T04:00:00.000Z')
    });

    expect(resultadoAntes.aplicado).toBe(false);
    expect(resultadoDespues.aplicado).toBe(true);
  });

  test.each(['Pendiente', 'Insolvente', 'Retrasado', 'Abono'])(
    'aplica el recargo al estado elegible %s',
    async (estatus) => {
      const mensualidad = crearMensualidad({ estatus });

      const resultado = await aplicar(mensualidad);

      expect(resultado.aplicado).toBe(true);
      expect(mensualidad.save).toHaveBeenCalledTimes(1);
    }
  );

  test.each(['Pagado', 'Exonerado', 'En revision', 'Exento por reposo', 'Becado'])(
    'no aplica el recargo al estado no elegible %s',
    async (estatus) => {
      const mensualidad = crearMensualidad({ estatus });

      const resultado = await aplicar(mensualidad);

      expect(resultado.aplicado).toBe(false);
      expect(mensualidad.save).not.toHaveBeenCalled();
    }
  );

  test.each([
    ['mensualidad de inscripcion', { es_inscripcion: true }, {}],
    ['periodo de inscripcion', {}, { fecha_inscripcion: new Date('2026-09-01T12:00:00.000Z') }],
    ['recargo desactivado para el alumno', {}, { aplicar_recargo_mensualidad: false }],
    ['beca completa', {}, { tipo_mensualidad: 'beca_completa' }],
    ['bloqueo manual', { bloqueo_recargo_automatico: true }, {}],
    ['monto base cero', { monto_esperado: 0, monto_sin_recargo_usd: 0 }, {}]
  ])('omite %s', async (descripcion, mensualidadOverrides, alumnoOverrides) => {
    const mensualidad = crearMensualidad(mensualidadOverrides, alumnoOverrides);

    const resultado = await aplicar(mensualidad);

    expect(resultado.aplicado).toBe(false);
    expect(mensualidad.save).not.toHaveBeenCalled();
  });

  test('omite la mensualidad cuando el recargo efectivo es cero', async () => {
    const mensualidad = crearMensualidad();

    const resultado = await aplicar(mensualidad, {
      cobroConfig: { ...COBRO_GLOBAL, recargo_usd: 0 }
    });

    expect(resultado.aplicado).toBe(false);
    expect(mensualidad.save).not.toHaveBeenCalled();
  });

  test('no duplica un recargo ya aplicado', async () => {
    const mensualidad = crearMensualidad({
      monto_esperado: 55,
      monto_sin_recargo_usd: 50,
      recargo_aplicado_usd: 5,
      monto_con_recargo_usd: 55
    });

    const resultado = await aplicar(mensualidad);

    expect(resultado.aplicado).toBe(false);
    expect(mensualidad.monto_esperado).toBe(55);
    expect(mensualidad.save).not.toHaveBeenCalled();
  });

  test('calcula sin guardar cuando persistir es false', async () => {
    const mensualidad = crearMensualidad();

    const resultado = await aplicar(mensualidad, { persistir: false });

    expect(resultado.aplicado).toBe(true);
    expect(mensualidad.monto_esperado).toBe(55);
    expect(mensualidad.save).not.toHaveBeenCalled();
  });
});

describe('actualizarRetrasadosCore', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('aplica el recargo a las 00:10 del dia configurado sin esperar un pago', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T04:10:00.000Z'));

    const mensualidad = crearMensualidad({}, {
      dia_limite_personalizado: 10,
      sede: { _id: 's1', usar_recargo_global: false, recargo_usd: 7 }
    });

    const populateRecargos = jest.fn().mockResolvedValue([mensualidad]);
    const Mensualidad = {
      find: jest.fn()
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue([])
          })
        })
        .mockReturnValueOnce({
          populate: populateRecargos
        })
    };
    const TenantConfig = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            cobro: { dia_cobro: 1, dia_vencimiento: 5, dias_gracia: 0, recargo_usd: 5 }
          })
        })
      })
    };

    const actualizadas = await actualizarRetrasadosCore({
      models: { Mensualidad, TenantConfig }
    });

    expect(actualizadas).toBe(1);
    expect(populateRecargos).toHaveBeenCalledWith(expect.objectContaining({
      path: 'id_alumno',
      select: expect.stringContaining('sede'),
      populate: expect.objectContaining({ path: 'sede' })
    }));
    expect(mensualidad.save).toHaveBeenCalledTimes(1);
    expect(mensualidad.monto_sin_recargo_usd).toBe(50);
    expect(mensualidad.recargo_aplicado_usd).toBe(7);
    expect(mensualidad.monto_con_recargo_usd).toBe(57);
    expect(mensualidad.monto_esperado).toBe(57);
  });

  test('procesa varias mensualidades y aplica solo las que alcanzaron su fecha individual', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T04:10:00.000Z'));
    const vencida = crearMensualidad({ _id: 'vencida' }, { dia_limite_personalizado: 10 });
    const futura = crearMensualidad({ _id: 'futura' }, { dia_limite_personalizado: 20 });
    const Mensualidad = {
      find: jest.fn()
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue([])
          })
        })
        .mockReturnValueOnce({
          populate: jest.fn().mockResolvedValue([vencida, futura])
        })
    };
    const TenantConfig = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ cobro: COBRO_GLOBAL })
        })
      })
    };

    const actualizadas = await actualizarRetrasadosCore({ models: { Mensualidad, TenantConfig } });

    expect(actualizadas).toBe(1);
    expect(vencida.save).toHaveBeenCalledTimes(1);
    expect(vencida.monto_esperado).toBe(55);
    expect(futura.save).not.toHaveBeenCalled();
    expect(futura.monto_esperado).toBe(50);
  });

  test('marca como insolvente una mensualidad vencida en la misma ejecucion diaria', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-11T04:10:00.000Z'));
    const mensualidadVencida = crearMensualidad({
      fecha_vencimiento: new Date('2026-09-10T03:59:59.999Z')
    }, { dia_limite_personalizado: 10 });
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const Mensualidad = {
      find: jest.fn()
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue([mensualidadVencida])
          })
        })
        .mockReturnValueOnce({
          populate: jest.fn().mockResolvedValue([])
        }),
      updateMany
    };

    const actualizadas = await actualizarRetrasadosCore({ models: { Mensualidad } });

    expect(actualizadas).toBe(1);
    expect(updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['m1'] } },
      { $set: { estatus: 'Insolvente' } }
    );
  });
});
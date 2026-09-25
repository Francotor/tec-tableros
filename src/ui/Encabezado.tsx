import { useState } from 'react';
import { useEditor } from '../store/editor';
import { useEstadoGuardado } from '../store/autoguardado';
import { exportarDxf, exportarPdf, exportarPng } from './exportacion';
import { DialogoCircuitos } from './DialogoCircuitos';
import { DialogoGuardarPlantilla, DialogoNuevoDesdePlantilla } from './DialogoPlantillas';
import { DialogoProyectos } from './DialogoProyectos';

const TEXTO_ESTADO = {
  guardado: 'Guardado',
  pendiente: 'Guardando…',
  error: 'No se pudo guardar',
} as const;

export function Encabezado() {
  const nombre = useEditor((s) => s.proyecto.nombre);
  const cotizacion = useEditor((s) => s.proyecto.numeroCotizacion);
  const setMeta = useEditor((s) => s.setMeta);
  const avisar = useEditor((s) => s.avisar);
  const estado = useEstadoGuardado((s) => s.estado);
  const [abierto, setAbierto] = useState(false);
  const [guardarPlantillaAbierto, setGuardarPlantillaAbierto] = useState(false);
  const [nuevoDesdePlantillaAbierto, setNuevoDesdePlantillaAbierto] = useState(false);
  const [circuitosAbierto, setCircuitosAbierto] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [generandoDxf, setGenerandoDxf] = useState(false);

  const bajarPng = () => {
    if (!exportarPng()) avisar('El tablero aún no está listo para exportar.');
  };

  const bajarPdf = async () => {
    setGenerando(true);
    try {
      await exportarPdf();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo generar el PDF.');
    } finally {
      setGenerando(false);
    }
  };

  const bajarDxf = async () => {
    setGenerandoDxf(true);
    try {
      await exportarDxf();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo generar el DXF.');
    } finally {
      setGenerandoDxf(false);
    }
  };

  return (
    <header className="barra">
      <img src={`${import.meta.env.BASE_URL}logo_tec.png`} alt="TEC Ingeniería Eléctrica y Construcción" />
      <div className="datos-proyecto">
        <label>
          Proyecto
          <input type="text" value={nombre} maxLength={80} onChange={(e) => setMeta({ nombre: e.target.value })} />
        </label>
        <label>
          N° cotización
          <input type="text" value={cotizacion} maxLength={30} onChange={(e) => setMeta({ numeroCotizacion: e.target.value })} />
        </label>
      </div>
      <span className={`estado-guardado ${estado}`} role="status" aria-live="polite">
        {TEXTO_ESTADO[estado]}
      </span>
      <div className="acciones-barra">
        <div className="grupo-acciones" role="group" aria-label="Proyecto">
          <span className="etiqueta-grupo">Proyecto</span>
          <div className="botones">
            <button type="button" onClick={() => setAbierto(true)}>
              Proyectos
            </button>
            <button type="button" onClick={() => setNuevoDesdePlantillaAbierto(true)}>
              Nuevo desde plantilla
            </button>
            <button type="button" className="primario" onClick={() => setGuardarPlantillaAbierto(true)}>
              Guardar como plantilla
            </button>
          </div>
        </div>
        <div className="grupo-acciones" role="group" aria-label="Edición">
          <span className="etiqueta-grupo">Edición</span>
          <div className="botones">
            <button type="button" onClick={() => setCircuitosAbierto(true)}>
              Circuitos
            </button>
          </div>
        </div>
        <div className="grupo-acciones" role="group" aria-label="Exportar">
          <span className="etiqueta-grupo">Exportar</span>
          <div className="botones">
            <button type="button" onClick={bajarPng}>
              PNG
            </button>
            <button type="button" onClick={() => void bajarPdf()} disabled={generando}>
              {generando ? 'Creando PDF…' : 'PDF'}
            </button>
            <button type="button" onClick={() => void bajarDxf()} disabled={generandoDxf} title="DXF R12 en mm, con capas por categoría, para AutoCAD.">
              {generandoDxf ? 'Creando DXF…' : 'DXF'}
            </button>
          </div>
        </div>
      </div>
      <DialogoProyectos abierto={abierto} onCerrar={() => setAbierto(false)} />
      <DialogoGuardarPlantilla abierto={guardarPlantillaAbierto} onCerrar={() => setGuardarPlantillaAbierto(false)} />
      <DialogoNuevoDesdePlantilla abierto={nuevoDesdePlantillaAbierto} onCerrar={() => setNuevoDesdePlantillaAbierto(false)} />
      <DialogoCircuitos abierto={circuitosAbierto} onCerrar={() => setCircuitosAbierto(false)} />
    </header>
  );
}

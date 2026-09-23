import { useMemo, useState } from 'react';
import { calcularAvisos } from '../core/avisos';
import type { AvisoLista } from '../core/avisos';
import { formatearMm } from '../core/biblioteca';
import { formatearMetros, generarLista, generarListaPorCircuito, lineasTotales, listaACsv, listaATexto } from '../core/lista';
import type { GrupoLista, ListaMateriales } from '../core/lista';
import { sugerirCaja } from '../core/sugerencia';
import type { Sugerencia } from '../core/sugerencia';
import { nombreSeguro } from '../core/proyectos';
import { useBiblioteca } from '../store/biblioteca';
import { useContexto, useEditor } from '../store/editor';
import { descargar } from './descarga';

interface Analisis {
  lista: ListaMateriales;
  sugerencia: Sugerencia | null;
  avisos: AvisoLista[];
}

/** Lista de materiales, sugerencia de caja y avisos del dibujo actual. */
export function useAnalisis(): Analisis | null {
  const ctx = useContexto();
  const gabinetes = useBiblioteca((s) => s.biblioteca?.gabinetes);
  const elementos = useEditor((s) => s.proyecto.elementos);
  return useMemo(() => {
    if (!ctx || !gabinetes) return null;
    const sugerencia = sugerirCaja(elementos, ctx, gabinetes);
    return { lista: generarLista(elementos, ctx), sugerencia, avisos: calcularAvisos(elementos, ctx, sugerencia) };
  }, [ctx, gabinetes, elementos]);
}

async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Respaldo para contextos sin permiso de portapapeles (por ejemplo, http sin certificado).
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function TablaLineas({ lineas, titulo }: { lineas: GrupoLista['lineas']; titulo?: string }) {
  return (
    <table className="tabla-lista">
      {titulo && (
        <caption>
          <strong>{titulo}</strong>
        </caption>
      )}
      <thead>
        <tr>
          <th scope="col">Cant.</th>
          <th scope="col">Descripción</th>
        </tr>
      </thead>
      <tbody>
        {lineas.map((l) => (
          <tr key={l.descripcion}>
            <td>
              {l.cantidad} {l.unidad}
            </td>
            <td>{l.descripcion}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PanelLista() {
  const analisis = useAnalisis();
  const proyecto = useEditor((s) => s.proyecto);
  const ctx = useContexto();
  const aplicarSugerencia = useEditor((s) => s.aplicarSugerencia);
  const avisar = useEditor((s) => s.avisar);
  const [agruparPorCircuito, setAgruparPorCircuito] = useState(false);

  if (!analisis) return <p className="vacio">Cargando…</p>;
  const { lista, sugerencia, avisos } = analisis;
  const hayDibujo = proyecto.elementos.length > 0;
  const grupos = agruparPorCircuito && ctx ? generarListaPorCircuito(proyecto.elementos, ctx, proyecto.circuitos) : null;

  const copiar = async () => {
    const ok = await copiarAlPortapapeles(listaATexto(lista));
    avisar(ok ? 'Lista copiada al portapapeles.' : 'No se pudo copiar la lista.', ok ? 'info' : 'error');
  };

  const bajarCsv = () =>
    descargar(`lista-materiales-${nombreSeguro(proyecto.numeroCotizacion || proyecto.nombre)}.csv`, listaACsv(lista), 'text/csv;charset=utf-8', true);

  const placa = sugerencia?.caja.placa;
  return (
    <div className="lista">
      {avisos.length > 0 && (
        <ul className="avisos-lista" aria-label="Avisos">
          {avisos.map((a) => (
            <li key={a.id}>{a.texto}</li>
          ))}
        </ul>
      )}

      {sugerencia && hayDibujo && (
        <div className="sugerencia">
          {sugerencia.esLaActual ? (
            <p>La caja actual es la más chica de la lista que contiene el dibujo.</p>
          ) : (
            <>
              <p>
                <strong>Caja sugerida:</strong> {sugerencia.caja.nombre}
                {placa && ` (placa ${formatearMm(placa.ancho)} × ${formatearMm(placa.alto)} mm)`}
              </p>
              <button type="button" onClick={() => aplicarSugerencia(sugerencia.caja.id, sugerencia.dx, sugerencia.dy)}>
                Usar esta caja
              </button>
            </>
          )}
        </div>
      )}
      {!sugerencia && hayDibujo && proyecto.elementos.length > 0 && (
        <p className="ayuda">Sin sugerencia de caja: no hay una caja del mismo tipo que contenga el dibujo (o la caja es plástica).</p>
      )}

      {proyecto.circuitos.length > 0 && (
        <label className="agrupar-circuito">
          <input type="checkbox" checked={agruparPorCircuito} onChange={(e) => setAgruparPorCircuito(e.target.checked)} />
          Agrupar por circuito
        </label>
      )}

      {grupos ? (
        <div className="grupos-lista">
          {grupos.map((g) => (
            <TablaLineas
              key={g.circuito?.id ?? 'sin-circuito'}
              lineas={g.lineas}
              titulo={g.circuito ? `${g.circuito.numero} · ${g.circuito.nombre}` : 'Sin circuito'}
            />
          ))}
        </div>
      ) : (
        <table className="tabla-lista">
          <thead>
            <tr>
              <th scope="col">Cant.</th>
              <th scope="col">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {lista.lineas.map((l) => (
              <tr key={l.descripcion}>
                <td>
                  {l.cantidad} {l.unidad}
                </td>
                <td>{l.descripcion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <table className="tabla-lista tabla-totales">
        <tfoot>
          {lineasTotales(lista).map((t) => (
            <tr key={t.descripcion}>
              <td>{formatearMetros(t.cantidad)} m</td>
              <td>{t.descripcion}</td>
            </tr>
          ))}
        </tfoot>
      </table>

      <div className="acciones-lista">
        <button type="button" onClick={() => void copiar()}>
          Copiar como texto
        </button>
        <button type="button" onClick={bajarCsv}>
          Descargar CSV
        </button>
      </div>
    </div>
  );
}

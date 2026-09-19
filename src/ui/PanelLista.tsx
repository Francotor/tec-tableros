import { useMemo } from 'react';
import { calcularAvisos } from '../core/avisos';
import type { AvisoLista } from '../core/avisos';
import { formatearMm } from '../core/biblioteca';
import { formatearMetros, generarLista, lineasTotales, listaACsv, listaATexto } from '../core/lista';
import type { ListaMateriales } from '../core/lista';
import { sugerirCaja } from '../core/sugerencia';
import type { Sugerencia } from '../core/sugerencia';
import { useBiblioteca } from '../store/biblioteca';
import { useContexto, useEditor } from '../store/editor';

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

function descargar(nombre: string, contenido: string, tipo: string): void {
  // El BOM inicial hace que Excel reconozca UTF-8.
  const blob = new Blob(['﻿', contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function nombreArchivo(base: string): string {
  const limpio = base.trim().replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '');
  return `lista-materiales-${limpio || 'tablero'}.csv`;
}

export function PanelLista() {
  const analisis = useAnalisis();
  const proyecto = useEditor((s) => s.proyecto);
  const aplicarSugerencia = useEditor((s) => s.aplicarSugerencia);
  const avisar = useEditor((s) => s.avisar);

  if (!analisis) return <p className="vacio">Cargando…</p>;
  const { lista, sugerencia, avisos } = analisis;
  const hayDibujo = proyecto.elementos.length > 0;

  const copiar = async () => {
    const ok = await copiarAlPortapapeles(listaATexto(lista));
    avisar(ok ? 'Lista copiada al portapapeles.' : 'No se pudo copiar la lista.', ok ? 'info' : 'error');
  };

  const bajarCsv = () =>
    descargar(nombreArchivo(proyecto.numeroCotizacion || proyecto.nombre), listaACsv(lista), 'text/csv;charset=utf-8');

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

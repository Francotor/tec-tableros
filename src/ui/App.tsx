import { useEffect, useState } from 'react';
import { useBiblioteca } from '../store/biblioteca';
import { useEditor } from '../store/editor';
import { iniciarAutoguardado, iniciarSesion } from '../store/autoguardado';
import { Encabezado } from './Encabezado';
import { BarraHerramientas } from './BarraHerramientas';
import { Lienzo } from './Lienzo';
import { PanelCatalogo } from './PanelCatalogo';
import { PanelDerecho } from './PanelDerecho';

export function App() {
  const { estado, biblioteca, error, cargar, tipo: tipoBiblioteca } = useBiblioteca();

  const [sesionLista, setSesionLista] = useState(false);

  const tipo = useEditor((s) => s.proyecto.tipo);
  const reconciliarCaja = useEditor((s) => s.reconciliarCaja);

  useEffect(() => {
    void iniciarSesion().finally(() => setSesionLista(true));
  }, []);

  // La biblioteca activa es la del tipo del proyecto abierto (tablero o medidor).
  useEffect(() => {
    void cargar(tipo);
  }, [cargar, tipo]);

  useEffect(() => {
    if (biblioteca) reconciliarCaja(biblioteca.gabinetes);
  }, [biblioteca, reconciliarCaja]);

  useEffect(() => (sesionLista ? iniciarAutoguardado() : undefined), [sesionLista]);

  return (
    <div className="app">
      <Encabezado />
      {(estado === 'cargando' || !sesionLista) && <p className="aviso">Cargando biblioteca…</p>}
      {estado === 'error' && <p className="aviso error">{error}</p>}
      {biblioteca && sesionLista && tipoBiblioteca === tipo && (
        <main className="cuerpo">
          <PanelCatalogo componentes={biblioteca.catalogo.componentes} categorias={biblioteca.catalogo.categorias} />
          <div className="zona-trabajo">
            <BarraHerramientas />
            <div className="area">
              <Lienzo />
              <PanelDerecho />
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

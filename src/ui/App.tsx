import { useEffect, useState } from 'react';
import { useBiblioteca } from '../store/biblioteca';
import { iniciarAutoguardado, iniciarSesion } from '../store/autoguardado';
import { Encabezado } from './Encabezado';
import { BarraHerramientas } from './BarraHerramientas';
import { Lienzo } from './Lienzo';
import { PanelCatalogo } from './PanelCatalogo';
import { PanelDerecho } from './PanelDerecho';

export function App() {
  const { estado, biblioteca, error, cargar } = useBiblioteca();

  const [sesionLista, setSesionLista] = useState(false);

  useEffect(() => {
    void cargar();
    void iniciarSesion().finally(() => setSesionLista(true));
  }, [cargar]);

  useEffect(() => (sesionLista ? iniciarAutoguardado() : undefined), [sesionLista]);

  return (
    <div className="app">
      <Encabezado />
      {(estado === 'cargando' || !sesionLista) && <p className="aviso">Cargando biblioteca…</p>}
      {estado === 'error' && <p className="aviso error">{error}</p>}
      {biblioteca && sesionLista && (
        <main className="cuerpo">
          <PanelCatalogo componentes={biblioteca.catalogo.componentes} />
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

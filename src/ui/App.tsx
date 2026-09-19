import { useEffect } from 'react';
import { useBiblioteca } from '../store/biblioteca';
import { BarraHerramientas } from './BarraHerramientas';
import { Lienzo } from './Lienzo';
import { PanelCatalogo } from './PanelCatalogo';
import { PanelPropiedades } from './PanelPropiedades';

export function App() {
  const { estado, biblioteca, error, cargar } = useBiblioteca();

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="app">
      <header className="barra">
        <img
          src={`${import.meta.env.BASE_URL}logo_tec.png`}
          alt="TEC Ingeniería Eléctrica y Construcción"
        />
        <h1>Editor de tableros</h1>
      </header>
      {estado === 'cargando' && <p className="aviso">Cargando biblioteca…</p>}
      {estado === 'error' && <p className="aviso error">{error}</p>}
      {biblioteca && (
        <main className="cuerpo">
          <PanelCatalogo componentes={biblioteca.catalogo.componentes} />
          <div className="zona-trabajo">
            <BarraHerramientas />
            <div className="area">
              <Lienzo />
              <PanelPropiedades />
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

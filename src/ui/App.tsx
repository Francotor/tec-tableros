import { useEffect } from 'react';
import { useBiblioteca } from '../store/biblioteca';
import { PanelCatalogo } from './PanelCatalogo';

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
      <main className="cuerpo">
        {estado === 'cargando' && <p className="aviso">Cargando biblioteca…</p>}
        {estado === 'error' && <p className="aviso error">{error}</p>}
        {biblioteca && <PanelCatalogo componentes={biblioteca.catalogo.componentes} />}
        <section className="lienzo">
          <p>El canvas llega en la Fase 1.</p>
        </section>
      </main>
    </div>
  );
}

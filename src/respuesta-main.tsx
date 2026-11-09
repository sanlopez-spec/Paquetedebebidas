// Entrada aparte para /club/respuesta (respuesta.html): sólo la página de "Voy / No voy", sin el resto del sitio ni sus scripts de medición.
import { createRoot } from 'react-dom/client';
import Respuesta from './club/Respuesta';
import './styles/fonts.css';

createRoot(document.getElementById('root')!).render(<Respuesta />);

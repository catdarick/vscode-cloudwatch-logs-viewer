import { createRoot } from 'react-dom/client';
import App from './components/App/App';
import { request } from './host';
import { injectBaseStyles } from './theme';
import { errorMessage } from './utils/errors';

injectBaseStyles();

const root = createRoot(document.getElementById('root')!);
request('init', {}).then(
  (init) => root.render(<App init={init} />),
  (e) => root.render(<p style={{ padding: 16 }}>Could not start the viewer: {errorMessage(e)}</p>)
);

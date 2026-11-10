import React from 'react';
import {createRoot} from 'react-dom/client';
import Studio from '../app/studio';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<Studio staticSite assetBase={import.meta.env.BASE_URL}/>);

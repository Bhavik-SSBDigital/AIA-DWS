import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import App from './App';

import './css/style.css';
import './css/satoshi.css';
import 'flatpickr/dist/flatpickr.min.css';

import { configureStore } from '@reduxjs/toolkit';
import { pathSlice } from './Slices/PathSlice';
import { Provider } from 'react-redux';

import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// ✅ IMPORTANT: use ONLY react-query (v3)
import { QueryClient, QueryClientProvider } from 'react-query';

// ✅ Create client OUTSIDE component
const queryClient = new QueryClient();

// Redux store
const store = configureStore({
  reducer: {
    path: pathSlice.reducer,
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <Provider store={store}>
          <App />
        </Provider>
      </Router>

      {/* Toast outside router is fine */}
      <ToastContainer
        position="bottom-right"
        autoClose={2000}
        hideProgressBar={true}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        draggable
        pauseOnHover
        style={{ zIndex: '999999' }}
      />
    </QueryClientProvider>
  </React.StrictMode>
);
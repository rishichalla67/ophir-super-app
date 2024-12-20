import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Redeem from './pages/Redeem'; // Add this import
import { WalletProvider } from './context/WalletContext';
import { SidebarProvider } from './context/SidebarContext';
import RedeemAnalytics from './pages/RedeemAnalytics';
import AnalyticsDashboard from './pages/TreasuryAnalytics';
import Bonds from './pages/Bonds';
import CreateBonds from './pages/CreateBonds'; // Add this import
import BuyBonds from './pages/BuyBonds'; // Add this import
import ResaleBonds from './pages/ResaleBonds'; // Add this import
import { CryptoProvider } from './context/CryptoContext';
import TreasuryAnalytics from './pages/TreasuryAnalytics-new';
import Govern from './pages/Govern'; // Add this import
import Issuers from './pages/Issuers'; // Add this import
import WasmDev from './pages/WasmDev'; // Add this import
import Seekers from './pages/Seekers'; // Add this import
import { NetworkProvider } from './context/NetworkContext';
import { IssuerProvider } from './context/IssuerContext';
import BuyResaleBonds from './pages/BuyResaleBonds'; // Add this import

function App() {
  return (
    <IssuerProvider>
      <NetworkProvider>
        <CryptoProvider>
          <SidebarProvider>
            <WalletProvider>
              <Router>
                <div className="App">
                  <Navbar />
                  <Sidebar />
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/redeem" element={<Redeem />} />
                    <Route path="/dashboard/redemptions" element={<RedeemAnalytics />} />
                    <Route path="/dashboard/treasury" element={<AnalyticsDashboard />} />
                    <Route path="/bonds" element={<Bonds />} />
                    <Route path="/bonds/create" element={<CreateBonds />} />
                    <Route path="/bonds/:bondId" element={<BuyBonds />} />
                    <Route path="/bonds/resale" element={<ResaleBonds />} />
                    <Route path="/bonds/resale/:bondIdNftId" element={<BuyResaleBonds />} />
                    <Route path="/analytics/new" element={<TreasuryAnalytics />} />
                    <Route path="/govern" element={<Govern />} />
                    <Route path="/bonds/issuer" element={<Issuers />} />
                    <Route path="/wasmdev" element={<WasmDev />} />
                    <Route path="/seekers" element={<Seekers />} />
                  </Routes>
                </div>
              </Router>
            </WalletProvider>
          </SidebarProvider>
        </CryptoProvider>
      </NetworkProvider>
    </IssuerProvider>
  );
}

export default App;

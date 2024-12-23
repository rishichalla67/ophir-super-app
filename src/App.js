import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Redeem from './pages/Redeem';
import { WalletProvider } from './context/WalletContext';
import { SidebarProvider } from './context/SidebarContext';
import RedeemAnalytics from './pages/RedeemAnalytics';
import AnalyticsDashboard from './pages/TreasuryAnalytics';
import Bonds from './pages/Bonds';
import CreateBonds from './pages/CreateBonds';
import BuyBonds from './pages/BuyBonds';
import ResaleBonds from './pages/ResaleBonds';
import { CryptoProvider } from './context/CryptoContext';
import TreasuryAnalytics from './pages/TreasuryAnalytics-new';
import Govern from './pages/Govern';
import Issuers from './pages/Issuers';
import WasmDev from './pages/WasmDev';
import Seekers from './pages/Seekers';
import { NetworkProvider } from './context/NetworkContext';
import { IssuerProvider } from './context/IssuerContext';
import BuyResaleBonds from './pages/BuyResaleBonds';
import MyBonds from './pages/MyBonds';
import { BondCacheProvider } from './context/BondCacheContext';

function App() {
  return (
    <IssuerProvider>
      <NetworkProvider>
        <CryptoProvider>
          <BondCacheProvider>
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
                      <Route path="/my-bonds" element={<MyBonds />} />
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
          </BondCacheProvider>
        </CryptoProvider>
      </NetworkProvider>
    </IssuerProvider>
  );
}

export default App;

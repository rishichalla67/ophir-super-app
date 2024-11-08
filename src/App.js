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

function App() {
  return (
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
              <Route path="/bonds/buy/:bondId" element={<BuyBonds />} />
              {/* Add more routes for other pages */}
            </Routes>
          </div>
        </Router>
      </WalletProvider>
    </SidebarProvider>
  );
}

export default App;

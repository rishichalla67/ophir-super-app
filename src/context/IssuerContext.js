import React, { createContext, useContext, useState } from 'react';

const IssuerContext = createContext();

export const IssuerProvider = ({ children }) => {
  const [isIssuer, setIsIssuer] = useState(false);

  return (
    <IssuerContext.Provider value={{ isIssuer, setIsIssuer }}>
      {children}
    </IssuerContext.Provider>
  );
};

export const useIssuer = () => useContext(IssuerContext); 
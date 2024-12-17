import React, { useEffect } from 'react';
import { Widget } from '@skip-go/widget';

const Swap = () => {
  useEffect(() => {
    // Load Skip Widget script
    const script = document.createElement('script');
    script.src = 'https://widget.skip.money/widget.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup script when component unmounts
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="p-4 sm:ml-64">
      <div className="p-4 border-2 border-gray-200 border-dashed rounded-lg dark:border-gray-700 mt-14">
        <h1 className="text-2xl font-bold mb-4">Swap</h1>
        <div id="skip-widget-container"></div>
        <div
          style={{
            width: '100%',
            maxWidth: '500px',
            padding: '0 10px',
          }}
        >
          <Widget
            theme="light"
            brandColor="#FF4FFF"
          />
        </div>
      </div>
    </div>
  );
};

export default Swap; 
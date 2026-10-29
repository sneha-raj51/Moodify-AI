import { getJamendoStatus } from '../services/jamendoService.js';
import { getAudiusStatus } from '../services/audiusService.js';

export const getJamendoConfig = (req, res) => {
  const status = getJamendoStatus();
  res.status(200).json({ 
    configured: status === 'connected',
    status: status
  });
};

export const getProvidersConfig = (req, res) => {
  const jamendoStatus = getJamendoStatus();
  const audiusStatus = getAudiusStatus();

  const providerMap = {
    itunes: {
      name: 'iTunes Search API',
      available: true,
      type: 'preview',
      durationSeconds: 30,
      label: '30-sec Preview'
    },
    audius: {
      name: 'Audius Protocol',
      available: audiusStatus === 'available',
      type: 'full',
      network: 'decentralized',
      label: 'Full Track'
    },
    jamendo: {
      name: 'Jamendo Music API',
      available: jamendoStatus === 'connected',
      type: 'full',
      requiresClientId: true,
      label: 'Full Track',
      configured: jamendoStatus === 'connected'
    }
  };

  res.status(200).json({
    providers: providerMap,
    ...providerMap
  });
};

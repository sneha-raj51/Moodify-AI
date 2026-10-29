import mongoose from 'mongoose';

export const getHealthStatus = (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Moodify AI Backend is running',
    timestamp: new Date().toISOString()
  });
};

export const getDbStatus = (req, res) => {
  const state = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const statusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialized',
  };

  const currentStatus = statusMap[state] || 'unknown';

  if (state === 1) {
    res.status(200).json({ status: 'success', dbState: currentStatus });
  } else {
    res.status(503).json({ status: 'error', dbState: currentStatus });
  }
};

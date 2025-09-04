// Note: We're using Drizzle directly with DATABASE_URL, not the Supabase client
// This file exists for any Supabase-specific utilities we might need

export const formatPhoneNumber = (phoneNumber: string | null): string | null => {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return null; // Return null if phoneNumber is invalid
  }

  // Remove all non-digits
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Check if it's a US number (starts with 1 and has 11 digits)
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const areaCode = cleaned.slice(1, 4);
    const exchange = cleaned.slice(4, 7);
    const number = cleaned.slice(7);
    return `+1 (${areaCode}) ${exchange}-${number}`;
  }
  
  // Check if it's a US number without country code (10 digits)
  if (cleaned.length === 10) {
    const areaCode = cleaned.slice(0, 3);
    const exchange = cleaned.slice(3, 6);
    const number = cleaned.slice(6);
    return `+1 (${areaCode}) ${exchange}-${number}`;
  }
  
  // Return as-is for international numbers
  return phoneNumber;
};

export const validatePhoneNumber = (phoneNumber: string): boolean => {
  const cleaned = phoneNumber.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
};

export const formatTimestamp = (timestamp: string | Date): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatFullTimestamp = (timestamp: string | Date): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
};

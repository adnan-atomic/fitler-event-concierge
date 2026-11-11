import React from 'react';
import { FC_MONOGRAM, FC_WORDMARK } from '../brand.js';

// Fitler Club monogram (F/C) or script wordmark, drawn in currentColor.
export const Mark = ({ word, className = '' }) => (
  <span className={`${word ? 'fc-word' : 'fc-mark'} ${className}`} role="img" aria-label="Fitler Club" dangerouslySetInnerHTML={{ __html: word ? FC_WORDMARK : FC_MONOGRAM }} />
);

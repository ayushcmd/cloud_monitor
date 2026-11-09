import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton, Tooltip } from '@mui/material';

export default function PasswordToggleButton({
  isVisible,
  onToggle,
  disabled = false,
  label = 'password',
  size = 18,
  className = '',
}) {
  const actionText = isVisible ? `Hide ${label}` : `Show ${label}`;

  return (
    <Tooltip title={actionText} arrow placement="top">
      <span className="absolute right-2.5 flex items-center">
        <IconButton
          type="button"
          onClick={onToggle}
          disabled={disabled}
          size="small"
          aria-label={actionText}
          className={`text-theme-subtle hover:text-theme-main transition-colors ${className}`}
          sx={{ color: 'var(--text-subtle)', p: 0.75 }}
        >
          {isVisible ? <EyeOff size={size} /> : <Eye size={size} />}
        </IconButton>
      </span>
    </Tooltip>
  );
}

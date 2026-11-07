import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

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
        <button
            type="button"
            className={`password-toggle-btn ${className}`.trim()}
            onClick={onToggle}
            aria-label={actionText}
            title={actionText}
            disabled={disabled}
        >
            {isVisible ? <EyeOff size={size} /> : <Eye size={size} />}
        </button>
    );
}


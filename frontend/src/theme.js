import { createTheme } from '@mui/material/styles';

export function getMuiTheme(mode = 'light') {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: {
        main: '#22B8B0',
        light: '#54C9EF',
        dark: '#1a9690',
        contrastText: '#FFFFFF',
      },
      secondary: {
        main: '#54C9EF',
        light: '#83D7F5',
        dark: '#2BA8D1',
        contrastText: '#FFFFFF',
      },
      success: {
        main: '#22B8A0',
        contrastText: '#FFFFFF',
      },
      warning: {
        main: '#F2C94C',
        contrastText: '#1A2634',
      },
      error: {
        main: '#EF7777',
        contrastText: '#FFFFFF',
      },
      info: {
        main: '#54C9EF',
        contrastText: '#FFFFFF',
      },
      background: {
        default: isDark ? '#111B29' : '#F7FAFC',
        paper: isDark ? '#1E2D3D' : '#FFFFFF',
      },
      text: {
        primary: isDark ? '#F0F6FC' : '#1A2634',
        secondary: isDark ? '#A3B8CC' : '#567086',
      },
      divider: isDark ? 'rgba(114, 157, 182, 0.25)' : 'rgba(120, 159, 180, 0.25)',
    },
    typography: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      button: {
        textTransform: 'none',
        fontWeight: 600,
      },
    },
    shape: {
      borderRadius: 10,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            textTransform: 'none',
            fontWeight: 600,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
          },
          containedPrimary: {
            background: 'linear-gradient(135deg, #22B8B0, #54C9EF)',
            color: '#FFFFFF',
            boxShadow: '0 4px 14px rgba(34, 184, 176, 0.3)',
            '&:hover': {
              background: 'linear-gradient(135deg, #1ea39c, #48b8db)',
              boxShadow: '0 6px 18px rgba(34, 184, 176, 0.4)',
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            borderRadius: 8,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 18,
            border: isDark ? '1px solid rgba(114, 157, 182, 0.35)' : '1px solid rgba(120, 159, 180, 0.35)',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.35)',
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            '&.Mui-checked': {
              color: '#22B8B0',
              '& + .MuiSwitch-track': {
                backgroundColor: '#22B8B0',
                opacity: 0.5,
              },
            },
          },
        },
      },
    },
  });
}


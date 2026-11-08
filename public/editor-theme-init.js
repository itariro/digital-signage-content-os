try {
  const theme = window.localStorage.getItem('mural-editor-theme')
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.classList.add(theme)
  }
} catch (error) {
  console.warn('Could not read editor theme preference; using system theme:', error)
}

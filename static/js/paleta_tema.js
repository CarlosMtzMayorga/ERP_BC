(function () {
    function obtenerPaletaTema() {
        var cs = window.getComputedStyle(document.documentElement);
        var get = function (name, fallback) {
            var v = cs.getPropertyValue(name);
            return (v && v.trim()) ? v.trim() : fallback;
        };
        return {
            primary: get('--theme-primary', '#dc2626'),
            hover: get('--theme-primary-hover', '#b91c1c'),
            active: get('--theme-primary-active', '#991b1b'),
            focus: get('--theme-primary-focus', '#ef4444'),
            rgb: get('--theme-primary-rgb', '220, 38, 38'),
            light: get('--theme-primary-light', '#fef2f2'),
            border: get('--theme-primary-border', '#fecaca'),
            text: get('--theme-primary-text', '#b91c1c'),
            contrast: get('--theme-primary-contrast', '#ffffff'),
            accent: get('--theme-accent', '#facc15'),
            gris: '#94a3b8'
        };
    }
    window.obtenerPaletaTema = obtenerPaletaTema;
})();
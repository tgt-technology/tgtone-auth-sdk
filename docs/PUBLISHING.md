# 📦 Publicar @tgtone/auth-sdk a NPM

> Guía para publicar nuevas versiones del SDK de autenticación

---

## ✅ Pre-requisitos

1. **Cuenta en NPM**: https://www.npmjs.com/signup
2. **Permisos en organización @tgtone**
3. **Login en terminal**:
```bash
npm login
# Ingresar: username, password, email, OTP (si tienes 2FA)
```

---

## 🚀 Proceso de Publicación

### 1. Ir a la carpeta del SDK
```bash
cd /home/jam/develop/tgtone/tgtone-console/packages/auth-sdk
```


### 2. Actualizar versión (si aplica)
```bash
# Patch (1.2.0 → 1.2.1) - Bug fixes
npm version patch

# Minor (1.2.0 → 1.3.0) - Nuevas features
npm version minor

# Major (1.2.0 → 2.0.0) - Breaking changes
npm version major
```

### 3. Limpiar build anterior
```bash
npm run clean
```

### 4. Compilar TypeScript
```bash
npm run build
```

### 5. Verificar archivos a publicar
```bash
npm pack --dry-run
```

Debe incluir:
- ✅ `dist/` (código compilado)
- ✅ `README.md`
- ✅ `docs/` (documentación)
- ✅ `package.json`

### 6. Publicar a NPM
```bash
npm publish
```

---

## 📦 Verificar Publicación

```bash
# Ver en NPM
open https://www.npmjs.com/package/@tgtone/auth-sdk

# Probar instalación
npm install @tgtone/auth-sdk@latest
```

---

## 🔐 Token NPM para CI/CD

Para publicar automáticamente desde GitHub Actions:

**1. Crear token en NPM:**
```
https://www.npmjs.com/settings/YOUR_USER/tokens
→ Generate New Token → Automation
```

**2. Agregar a GitHub Secrets:**
```
Repo Settings → Secrets and variables → Actions → New secret
Name: NPM_TOKEN
Value: npm_xxx...
```

**3. Usar en workflow:**
```yaml
- name: Publish to NPM
  run: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 📋 Checklist Pre-publicación

- [ ] Código actualizado y funcional
- [ ] Tests pasando (si los hay)
- [ ] Versión incrementada en `package.json`
- [ ] `README.md` actualizado con cambios
- [ ] Documentación en `docs/` actualizada
- [ ] Build exitoso (`npm run build`)
- [ ] Login en NPM (`npm whoami`)

---

## ⚡ Comandos Rápidos

```bash
# Todo en uno (publicación completa)
npm run clean && npm run build && npm publish

# Con bump de versión patch
npm version patch && npm run clean && npm run build && npm publish
```

---

## 📌 Información del Package

**Nombre:** `@tgtone/auth-sdk`  
**Scope:** `@tgtone` (organización NPM)  
**Versión actual:** 1.4.4  
**Registry:** https://registry.npmjs.org  
**Package URL:** https://www.npmjs.com/package/@tgtone/auth-sdk

---

**Última actualización:** 2025-11-03

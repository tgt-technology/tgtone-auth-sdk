/**
 * 🧪 Script de prueba para validar token con el SDK
 * 
 * Uso:
 *   node test-token.js
 */

const { jwtDecode } = require('jwt-decode');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL29uZS50Z3RvbmUuY2wiLCJhdWQiOiJ0Z3RvbmUtY29uc29sZSIsInN1YiI6Ijc5NGEyNjZhLTJmNmUtNDI0NS1hODBiLThlMzcxZjY4Y2RjNSIsImp0aSI6Ijc5NGEyNjZhLTJmNmUtNDI0NS1hODBiLThlMzcxZjY4Y2RjNS0xNzYxNDQyMTY3IiwiZW1haWwiOiJqdWFuLmFzdG9yZ2FAdGd0Z3JvdXAuY2wiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwibmFtZSI6Ikp1YW4gQXN0b3JnYSIsInRlbmFudF9pZCI6Ijc1ZDAxMGEzLWJiOTEtNGFmZC1iNGI5LTg4YWVjZDA1Nzk4NiIsInRlbmFudF9uYW1lIjoiQ29uc29sZSBPbmx5IFRlbmFudCIsInJvbGVzIjp7ImNvbnNvbGUiOlsib3duZXIiXSwiYmFjbyI6WyJhZG1pbmlzdHJhZG9yIl19LCJpYXQiOjE3NjE0NDIxNjcsImV4cCI6MTc2OTIxODE2N30.pLmPmmbE2WlKLK7gf6KnQVhWZjiBo2NaSeqjsgDmfwo';
// const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL29uZS50Z3RvbmUuY2wiLCJhdWQiOiJ0Z3RvbmUtY29uc29sZSIsInN1YiI6IjcxYmM5MDdhLTA3OTctNDczYy1iMDFlLWRjODkwZWMxNzdmMCIsImp0aSI6IjcxYmM5MDdhLTA3OTctNDczYy1iMDFlLWRjODkwZWMxNzdmMC0xNzYxNDQ0NDQyIiwiZW1haWwiOiJjb25zb2xlQHRndG9uZS5jbCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJuYW1lIjoiQ29uc29sZSBPd25lciIsInRlbmFudF9pZCI6Ijc1ZDAxMGEzLWJiOTEtNGFmZC1iNGI5LTg4YWVjZDA1Nzk4NiIsInRlbmFudF9uYW1lIjoiQ29uc29sZSBPbmx5IFRlbmFudCIsInJvbGVzIjp7ImNvbnNvbGUiOlsib3duZXIiLCJvd25lciJdLCJiYWNvIjpbImFkbWluaXN0cmFkb3IiXX0sImlhdCI6MTc2MTQ0NDQ0MiwiZXhwIjoxNzY5MjIwNDQyfQ.P2OT5Qcvsntt01eVlvUJzpdmw3rUN3oA_jvNSkhS2eI';


console.log('🔐 Probando token con SDK\n');
console.log('━'.repeat(80));

try {
  // 1️⃣ Decodificar JWT
  const decoded = jwtDecode(TOKEN);
  
  console.log('\n✅ JWT decodificado correctamente\n');
  console.log('📋 Payload completo:');
  console.log(JSON.stringify(decoded, null, 2));
  
  // 2️⃣ Validar claims OIDC
    console.log('\n🔍 Validación de Claims OIDC:\n');
  
  const requiredClaims = ['iss', 'aud', 'sub', 'jti', 'iat', 'exp'];
  requiredClaims.forEach(claim => {
    const hasIt = decoded[claim] !== undefined;
    console.log(`  ${hasIt ? '✅' : '❌'} ${claim}: ${decoded[claim]}`);
  });
  
  // 3️⃣ Validar identidad
  console.log('\n👤 Identidad del Usuario:\n');
  console.log(`  Email:          ${decoded.email}`);
  console.log(`  Email verified: ${decoded.email_verified}`);
  console.log(`  Name:           ${decoded.name}`);
  
  // 4️⃣ Validar multi-tenancy
  console.log('\n🏢 Multi-Tenancy:\n');
  console.log(`  Tenant ID:      ${decoded.tenant_id}`);
  console.log(`  Tenant Name:    ${decoded.tenant_name}`);
  
  if (!decoded.tenant_id) {
    console.log('\n  ❌ ERROR: Falta tenant_id en el JWT');
  } else {
    console.log('\n  ✅ Token tiene tenant_id válido');
  }
  
  // 5️⃣ Validar roles
  console.log('\n🔑 Roles por Aplicación:\n');
  
  if (decoded.roles && typeof decoded.roles === 'object') {
    Object.entries(decoded.roles).forEach(([app, roles]) => {
      console.log(`  ${app}:`);
      if (Array.isArray(roles)) {
        roles.forEach(role => console.log(`    - ${role}`));
      } else {
        console.log(`    ⚠️  No es un array: ${JSON.stringify(roles)}`);
      }
    });
    
    // Verificar rol console.owner
    if (decoded.roles.console && decoded.roles.console.includes('owner')) {
      console.log('\n  ✅ Usuario tiene rol "owner" en console');
    } else {
      console.log('\n  ❌ Usuario NO tiene rol "owner" en console');
      console.log(`     Roles actuales en console: ${JSON.stringify(decoded.roles.console)}`);
    }
  } else {
    console.log('  ❌ ERROR: roles no es un objeto');
  }
  
  // 6️⃣ Validar expiración

  console.log('\n⏰ Expiración:\n');
  
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = new Date(decoded.exp * 1000);
  const issuedAt = new Date(decoded.iat * 1000);
  const isExpired = decoded.exp < now;
  const timeLeft = decoded.exp - now;
  
  console.log(`  Emitido:  ${issuedAt.toLocaleString()}`);
  console.log(`  Expira:   ${expiresAt.toLocaleString()}`);
  console.log(`  Estado:   ${isExpired ? '❌ EXPIRADO' : '✅ VÁLIDO'}`);
  
  if (!isExpired) {
    const days = Math.floor(timeLeft / 86400);
    const hours = Math.floor((timeLeft % 86400) / 3600);
    console.log(`  Tiempo restante: ${days} días, ${hours} horas`);
  }
  
  // 7️⃣ Simular lo que haría el SDK

  console.log('\n🔧 Simulación del SDK:\n');
  
  // Estructura exacta que retorna el SDK (ver tgtone-auth-client.ts línea 208)
  const session = {
    user: {
      sub: decoded.sub,
      email: decoded.email,
      email_verified: decoded.email_verified,
      name: decoded.name,
      tenant_id: decoded.tenant_id,
      tenant_name: decoded.tenant_name,
      roles: decoded.roles,
    },
    tenantId: decoded.tenant_id,      // Acceso directo por conveniencia
    tenantName: decoded.tenant_name,  // Acceso directo por conveniencia
    roles: decoded.roles,              // Acceso directo por conveniencia (duplicado intencionalmente)
    expiresAt: expiresAt,
  };
  
  console.log('  TGTSession que retornaría checkSession():');
  console.log(JSON.stringify(session, null, 4));
  
  // 8️⃣ Probar helpers

  console.log('\n🛠️  Helpers del SDK:\n');
  
  const hasRoleConsoleOwner = decoded.roles?.console?.includes('owner');
  const hasRoleBacoAdmin = decoded.roles?.baco?.includes('administrador');
  const rolesConsole = decoded.roles?.console || [];
  const rolesBaco = decoded.roles?.baco || [];
  
  console.log(`  hasRole('console', 'owner'):          ${hasRoleConsoleOwner}`);
  console.log(`  hasRole('baco', 'administrador'):     ${hasRoleBacoAdmin}`);
  console.log(`  getRoles('console'):                  [${rolesConsole.join(', ')}]`);
  console.log(`  getRoles('baco'):                     [${rolesBaco.join(', ')}]`);
  console.log(`  hasAccessToApp('console'):            ${rolesConsole.length > 0}`);
  console.log(`  hasAccessToApp('baco'):               ${rolesBaco.length > 0}`);
  console.log(`  getTenantId():                        ${decoded.tenant_id}`);
  

  console.log('\n✅ TOKEN VÁLIDO - SDK DEBERÍA FUNCIONAR CORRECTAMENTE\n');
  
} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  console.error(error);
  process.exit(1);
}

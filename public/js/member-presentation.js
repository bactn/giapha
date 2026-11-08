// Shared display rules; never infer an early death from missing dates.
const knownDate = value => {
  const text = String(value || '').trim();
  return /^(?:[-?–—]+|không rõ|chưa rõ|unknown|null)$/i.test(text) ? '' : text;
};
export function lifeDates(member) {
  const birth = knownDate(member.birth_date);
  const death = knownDate(member.death_date_solar) || knownDate(member.death_date);
  const early = member.status === 'Mất sớm' || /^mất sớm$/i.test(death);
  const died = early || member.status === 'Đã mất' || Boolean(death);
  const deathLabel = death && !/^(?:mất sớm|đã mất|mất)$/i.test(death) ? `Mất ${death}` : early ? 'Mất sớm' : died ? 'Mất' : '';
  return [birth ? `SN ${birth}` : '', deathLabel].filter(Boolean).join(' - ');
}
export function calendarDate(value) {
  const text=String(value || '').trim().replace(/^SN\s*/i,'');
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  let year,month,day;
  if(iso) [,year,month,day]=iso.map(Number);
  else if(local) { day=Number(local[1]);month=Number(local[2]);year=Number(local[3]); }
  else if(/^\d{4}$/.test(text)) return {year:Number(text),month:null,day:null};
  else return null;
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day ? {year,month,day} : null;
}
export function lifespanAge(member) {
  const manual=member.lifespan_override;
  if(manual !== '' && manual !== null && manual !== undefined && Number.isInteger(Number(manual)) && Number(manual)>=0 && Number(manual)<=200) return Number(manual);
  const born=calendarDate(member.birth_date), died=calendarDate(member.death_date_solar);
  if(!born || !died) return null;
  let age=died.year-born.year;
  if(born.month && died.month && (died.month<born.month || (died.month===born.month && died.day<born.day))) age--;
  return age>=0 ? age : null;
}
export function spouseRole(member, spouse = null) {
  if (spouse?.gender === 'Nữ') return 'Vợ';
  if (spouse?.gender === 'Nam') return 'Chồng';
  return member.gender === 'Nam' ? 'Vợ' : member.gender === 'Nữ' ? 'Chồng' : 'Vợ/Chồng';
}
export function displayName(member) {
  return `${member.christian_name ? '[' + member.christian_name + '] ' : ''}${member.full_name || 'Chưa rõ tên'}`;
}
export function spouseDetails(member, store) {
  const partner = store?.getSpouseMember(member.id);
  if (partner) return `${spouseRole(member, partner)}: ${displayName(partner)}${lifeDates(partner) ? ' · ' + lifeDates(partner) : ''}`;
  return member.spouse ? `${spouseRole(member)}: ${member.spouse}` : '';
}
export function avatarSVG(gender) {
  const female = gender === 'Nữ';
  const label = female ? 'Avatar nữ' : gender === 'Nam' ? 'Avatar nam' : 'Avatar thành viên';
  return `<svg viewBox="0 0 48 48" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="24" fill="${female ? '#ffe4e6' : '#dbeafe'}"/>
    ${female ? '<path d="M12 25V19a12 12 0 0 1 24 0v17H12Z" fill="#65453d"/>' : ''}
    <path d="M6 48v-5a18 14 0 0 1 36 0v5" fill="${female ? '#be4567' : '#426ba3'}"/><path d="M19 29h10v9l-5 4-5-4Z" fill="#e6ad89"/>
    <ellipse cx="24" cy="21" rx="9" ry="12" fill="#f4c9a8"/>
    <path d="${female ? 'M14 21V18a10 11 0 0 1 20 0v7c-2-7-7-7-10-13-1 5-5 8-10 9Z' : 'M14 22V17a10 10 0 0 1 20 0v6l-3-7c-5 2-9 0-12-2l-2 8Z'}" fill="#65453d"/>
    <circle cx="21" cy="23" r=".8" fill="#65453d"/><circle cx="28" cy="23" r=".8" fill="#65453d"/><path d="M21 28q3 2 6 0" fill="none" stroke="#ba7863" stroke-linecap="round"/></svg>`;
}
export function drawAvatar(ctx, gender, cx, cy, radius) {
  const female = gender === 'Nữ';
  ctx.save(); ctx.translate(cx-radius,cy-radius); ctx.scale(radius/24,radius/24);
  ctx.beginPath(); ctx.arc(24,24,24,0,Math.PI*2); ctx.clip();
  ctx.fillStyle=female?'#ffe4e6':'#dbeafe'; ctx.fillRect(0,0,48,48);
  ctx.fillStyle='#65453d'; if(female) ctx.fillRect(12,16,24,23);
  ctx.fillStyle=female?'#be4567':'#426ba3'; ctx.beginPath(); ctx.ellipse(24,47,19,16,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#f4c9a8'; ctx.beginPath(); ctx.ellipse(24,22,9,12,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#65453d'; ctx.beginPath(); ctx.ellipse(24,14,10,6,0,Math.PI,Math.PI*2); ctx.lineTo(34,21); ctx.lineTo(29,15); ctx.lineTo(17,18); ctx.lineTo(14,23); ctx.fill(); ctx.restore();
}

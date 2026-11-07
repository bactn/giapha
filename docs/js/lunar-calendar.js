// lunar-calendar.js - Lunar Calendar Death Anniversary (Giỗ Âm Lịch) Manager
import { escapeHTML } from './html.js';
import { calendarDate } from './member-presentation.js';
export class LunarCalendarManager {
  static extractLunarDate(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.trim();

    // Match patterns like "15/08", "21/3", "15/08/1998 Âm", "12 - 3"
    const match = clean.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return { day, month, raw: clean };
      }
    }
    return null;
  }

  static getAnniversariesByMonth(dataStore, calendar = 'lunar') {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      items: []
    }));

    const unknownItems = [];

    for (const m of dataStore.getAllMembers()) {
      if (m.status === 'Đã mất' || m.status === 'Mất sớm' || m.death_date || m.death_date_solar) {
        const rawDate=calendar==='solar' ? m.death_date_solar : m.death_date;
        const parsed = calendar==='solar' ? calendarDate(rawDate) : this.extractLunarDate(rawDate);
        if (parsed?.day && parsed?.month) {
          months[parsed.month - 1].items.push({
            member: m,
            day: parsed.day,
            month: parsed.month,
            rawText: rawDate
          });
        } else {
          unknownItems.push(m);
        }
      }
    }

    // Sort items inside each month by day
    for (const group of months) {
      group.items.sort((a, b) => a.day - b.day);
    }

    return { months, unknownItems };
  }

  static renderGiỗList(container, dataStore, onSelectMember, calendar = 'lunar') {
    const { months, unknownItems } = this.getAnniversariesByMonth(dataStore,calendar);
    container.innerHTML = '';

    let totalAnniversaries = 0;
    months.forEach(m => totalAnniversaries += m.items.length);

    if (totalAnniversaries === 0 && unknownItems.length === 0) {
      container.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs">Chưa có thông tin ngày giỗ nào được nhập.</div>';
      return;
    }

    // Render month groups
    for (const group of months) {
      if (group.items.length === 0) continue;

      const monthCard = document.createElement('div');
      monthCard.className = 'border border-slate-200 rounded-xl overflow-hidden shadow-xs mb-3';

      const header = document.createElement('div');
      header.className = 'px-3 py-2 bg-amber-50/80 border-b border-amber-200/60 font-bold text-xs text-amber-900 flex items-center justify-between';
      header.innerHTML = `
        <span>Tháng ${group.month} ${calendar==='solar'?'Dương lịch':'Âm lịch'}</span>
        <span class="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-full">${group.items.length} ngày giỗ</span>
      `;
      monthCard.appendChild(header);

      const list = document.createElement('div');
      list.className = 'divide-y divide-slate-100 bg-white';

      for (const item of group.items) {
        const row = document.createElement('div');
        row.className = 'p-2.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors';
        row.innerHTML = `
          <div class="flex items-center space-x-2.5">
            <span class="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex flex-col items-center justify-center font-bold text-xs leading-none">
              <span>${item.day}</span>
              <span class="text-[8px] font-normal uppercase">${calendar==='solar'?'DL':'ÂL'}</span>
            </span>
            <div>
              <div class="font-bold text-slate-800 flex items-center space-x-1">
                ${item.member.christian_name ? `<span class="text-amber-700 font-semibold">[${escapeHTML(item.member.christian_name)}]</span>` : ''}
                <span>${escapeHTML(item.member.full_name)}</span>
                <span class="text-[10px] text-slate-400 font-normal">(${escapeHTML(item.member.id)} • Đời ${escapeHTML(item.member.generation)})</span>
              </div>
              <div class="text-[11px] text-slate-500">${escapeHTML(item.rawText)}</div>
            </div>
          </div>
          <button class="text-[11px] text-amber-700 hover:text-amber-900 font-semibold px-2 py-1 bg-amber-50 hover:bg-amber-100 rounded-lg">
            Xem Cây →
          </button>
        `;
        row.onclick = () => {
          if (onSelectMember) onSelectMember(item.member.id);
        };
        list.appendChild(row);
      }

      monthCard.appendChild(list);
      container.appendChild(monthCard);
    }
    if(unknownItems.length) {
      const section=document.createElement('section'); section.className='border rounded-xl p-3';
      const title=document.createElement('h4'); title.textContent='Chưa rõ ngày/tháng '+(calendar==='solar'?'dương lịch':'âm lịch'); section.append(title);
      for(const member of unknownItems) {const button=document.createElement('button'); button.type='button';button.className='block py-2 text-amber-700';button.textContent=member.full_name+' — Xem cây';button.onclick=()=>onSelectMember?.(member.id);section.append(button);}
      container.append(section);
    }
  }
}

/* Квиз «рассчитать потолок»: 5 вопросов → цена → заявка.
   Цены берутся из JSON на странице (подставляет build.py из данных клиента),
   поэтому один и тот же скрипт работает для любой фирмы. */
(function () {
  "use strict";

  var data = JSON.parse(document.getElementById("quiz-data").textContent);
  var QUESTIONS = 5;

  /* «Матовый» → «матовый», но «ЛДСП» и «Пленка МДФ» → «ЛДСП», «пленка МДФ» */
  function decap(s) { return /^\p{Lu}\p{Ll}/u.test(s) ? s[0].toLowerCase() + s.slice(1) : s; }
  function round100(x) { return Math.round(x / 100) * 100; }
  var NB = "\u00a0";   // неразрывный пробел: «30 700 ₽» не рвется на две строки
  function num(x) { return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, NB); }
  function rub(x) { return num(x) + NB + "₽"; }
  function priceRange(r) { return num(r.low) + " – " + num(r.high) + NB + "₽" + (data.total_suffix || ""); }

  /* Расчет: основа (полотно за м², окно за шт.) + допы. Количество светильников и метры линий —
     типовые нормы, чтобы человек увидел реальную вилку, а не «от 490 ₽». */
  function calc(s) {
    var rooms = Math.max(1, s.rooms);
    // у услуг с фиксированной ценой (бухгалтерия, юрист) количество может быть 0: «сотрудников нет»
    var area = data.base_fixed ? Math.max(0, s.area) : Math.max(1, s.area);
    var canvas = data.canvas[s.canvas] || data.canvas[Object.keys(data.canvas)[0]];
    var base = data.base_line.replace("{name}", data.base_line.indexOf("{name}") === 0 ? canvas.name : decap(canvas.name)).replace("{n}", area);
    var lines = [{ name: base, sum: data.base_fixed ? canvas.price : area * canvas.price }];
    s.light.forEach(function (id) {
      var l = data.light[id];
      if (!l) return;
      var qty, label;
      if (l.unit === "room") { qty = rooms; label = qty + " шт."; }
      else if (l.unit === "spot") { qty = Math.ceil(area / 2.5); label = qty + " шт."; }
      else if (l.unit === "line") { qty = Math.ceil(area * 0.3); label = qty + " м"; }
      else if (l.unit === "fixed") { qty = 1; label = ""; }   // разовая услуга
      else if (l.unit === "each") { qty = area; label = qty + " " + data.amount_unit; }   // на каждое окно / метр
      else { qty = Math.round(4 * Math.sqrt(area / rooms) * rooms); label = qty + " м"; }
      if (!qty) return;   // «0 сотрудников» — строку «Зарплата, 0 чел.» не показываем
      lines.push({ name: label ? l.name + ", " + label : l.name, sum: qty * l.price });
    });
    var total = lines.reduce(function (a, l) { return a + l.sum; }, 0);
    return { lines: lines, total: total, low: round100(total * 0.95), high: round100(total * 1.1) };
  }
  window.calcCeiling = calc;   // для тестов

  var form = document.querySelector("[data-quiz-form]");
  if (!form) return;
  var steps = form.querySelectorAll("[data-step]");
  var prev = form.querySelector("[data-prev]");
  var next = form.querySelector("[data-next]");
  var nav = form.querySelector("[data-nav]");
  var bar = document.querySelector("[data-progress]");
  var stepN = document.querySelector("[data-step-n]");
  var err = form.querySelector("[data-err]");
  var cur = 1;

  function state() {
    var fd = new FormData(form);
    return {
      rooms: fd.getAll("rooms").length,
      roomNames: fd.getAll("rooms"),
      area: parseInt(fd.get("area"), 10) || 0,
      canvas: fd.get("canvas"),
      light: fd.getAll("light"),
      when: fd.get("when")
    };
  }

  function render() {
    var r = calc(state());
    form.querySelector("[data-total]").textContent = priceRange(r);
    var ul = form.querySelector("[data-lines]");
    ul.innerHTML = "";
    r.lines.forEach(function (l) {
      var li = document.createElement("li");
      var a = document.createElement("span"); a.textContent = l.name;
      var b = document.createElement("span"); b.textContent = rub(l.sum);
      li.append(a, b); ul.append(li);
    });
  }

  function show(n) {
    cur = n;
    steps.forEach(function (s) {
      var on = +s.dataset.step === n;
      s.classList.toggle("is-active", on);
      s.hidden = !on;
    });
    var q = Math.min(n, QUESTIONS);
    bar.style.width = (n > QUESTIONS ? 100 : q / QUESTIONS * 100) + "%";
    stepN.textContent = n > QUESTIONS ? "Готово — ваш расчет" : "Шаг " + q + " из " + QUESTIONS;
    prev.disabled = n === 1;
    next.hidden = n > QUESTIONS;
    nav.hidden = n > QUESTIONS + 1;
    form.classList.toggle("is-final", n > QUESTIONS);   // на результате «Назад» не липнет поверх формы
    if (n === QUESTIONS + 1) render();
  }

  function needRooms() {
    var hint = steps[0].querySelector(".hint");
    if (state().rooms) { hint.textContent = "Можно выбрать несколько"; hint.style.color = ""; return false; }
    hint.textContent = steps[0].querySelector("legend").dataset.empty;
    hint.style.color = "var(--err)";
    return true;
  }

  next.addEventListener("click", function () {
    if (cur === 1 && needRooms()) return;
    show(cur + 1);
    document.getElementById("quiz").scrollIntoView({ block: "start" });
  });
  prev.addEventListener("click", function () { if (cur > 1) show(cur - 1); });
  form.addEventListener("change", function (e) { if (e.target.name === "rooms") needRooms(); });

  var slider = form.querySelector("[name=area]");
  var out = form.querySelector("[data-area-out]");
  slider.addEventListener("input", function () { out.textContent = slider.value; });

  var phone = form.querySelector("[name=phone]");
  phone.addEventListener("input", function () {
    var d = phone.value.replace(/\D/g, "").replace(/^8/, "7");
    if (d && d[0] !== "7") d = "7" + d;
    d = d.slice(0, 11);
    var p = d ? "+7" : "";
    if (d.length > 1) p += " (" + d.slice(1, 4);
    if (d.length >= 4) p += ") " + d.slice(4, 7);
    if (d.length >= 7) p += "-" + d.slice(7, 9);
    if (d.length >= 9) p += "-" + d.slice(9, 11);
    phone.value = p;
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var digits = String(fd.get("phone") || "").replace(/\D/g, "");
    var msg = digits.length !== 11 ? "Проверьте номер телефона"
      : !fd.get("agree") ? "Нужно согласие на обработку данных" : "";
    err.hidden = !msg;
    err.textContent = msg;
    if (msg) return;
    var s = state(), r = calc(s);
    var lead = {
      name: fd.get("name") || "", phone: "+" + digits, contact: fd.get("contact"),
      rooms: s.roomNames, area: s.area, canvas: s.canvas, light: s.light, when: s.when,
      estimate: priceRange(r)
    };
    if (data.endpoint) {
      fetch(data.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) })
        .catch(function () { /* сбой сети не ломает квиз: человек все равно видит «принято» и телефон */ });
    }
    window.lastLead = lead;   // для тестов
    show(QUESTIONS + 2);
  });

  /* мобильная кнопка не дублирует кнопку первого экрана и не мешает квизу */
  var sticky = document.querySelector(".sticky-cta");
  if (sticky && "IntersectionObserver" in window) {
    var seen = {};
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { seen[e.target.id] = e.isIntersecting; });
      sticky.classList.toggle("is-hidden", seen.hero || seen.quiz);
    });
    io.observe(document.getElementById("hero"));
    io.observe(document.getElementById("quiz"));
  }

  show(1);
})();

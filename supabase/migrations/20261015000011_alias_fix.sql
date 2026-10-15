-- Fix: adjectives that already end in e ("leise") got the ending twice ("Leisee Wiese").

create or replace function app.random_alias() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  adjectives text[] := array['grün','rot','blau','gelb','bunt','still','leise','wild','zart','mutig','klug','flink','sanft','hell',
    'warm','kühl','frisch','weit','klar','ruhig','froh','heiter','stolz','schlau','fleißig','neugierig','klein','groß','alt','jung',
    'schnell','sonnig','windig','verträumt','tapfer','freundlich','glücklich','friedlich','lustig','munter','treu','brav','kühn','rund'];
  feminine text[] := array['Wiese','Möwe','Birke','Eiche','Linde','Weide','Lerche','Meise','Amsel','Biene','Hummel','Libelle','Forelle',
    'Eule','Schwalbe','Quelle','Welle','Wolke','Brise','Insel','Düne','Lichtung','Tanne','Buche','Blume','Kastanie','Schnecke','Ente',
    'Krähe','Taube','Elster','Fichte','Ulme','Distel','Mohnblume','Ziege','Eidechse','Muschel','Lagune'];
  masculine text[] := array['Fuchs','Kiesel','Hase','Igel','Dachs','Falke','Rabe','Spatz','Fink','Storch','Biber','Otter','Hirsch','Luchs',
    'Schmetterling','Löwenzahn','Bach','Hügel','Wald','Berg','Mond','Stern','Wind','Regen','Nebel','Morgen','Apfel','Kirschbaum','Ahorn',
    'Holunder','Kranich','Reiher','Wal','Pilz','Farn','See','Fluss','Strand'];
  neuter text[] := array['Reh','Eichhörnchen','Kaninchen','Rotkehlchen','Blatt','Moos','Gras','Feld','Tal','Ufer','Segel','Wiesel','Lamm',
    'Veilchen','Gänseblümchen','Schaf','Pferd','Huhn','Küken','Nest','Licht','Wasser','Echo'];
  adj text; a text; tries int := 0;
begin
  loop
    -- 'leise' + 'e' would read 'Leisee': drop a final e before the ending.
    adj := regexp_replace(initcap(adjectives[1 + floor(random() * array_length(adjectives, 1))::int]), 'e$', '');
    case floor(random() * 3)::int
      when 0 then a := adj || 'e ' || feminine[1 + floor(random() * array_length(feminine, 1))::int];
      when 1 then a := adj || 'er ' || masculine[1 + floor(random() * array_length(masculine, 1))::int];
      else a := adj || 'es ' || neuter[1 + floor(random() * array_length(neuter, 1))::int];
    end case;
    tries := tries + 1;
    exit when not exists (select 1 from public.profiles where alias = a) or tries >= 30;
  end loop;
  -- Every combination taken (a very large community): add a number so sign-up never gets stuck.
  if exists (select 1 from public.profiles where alias = a) then a := a || ' ' || (10 + floor(random() * 90))::int; end if;
  return a;
end $$;


do $fix$
declare r record; a text;
begin
  for r in select id from public.profiles where alias like 'Leisee%' loop
    a := app.random_alias();
    update public.profiles set alias = a, display_name = case when display_mode = 'alias' then a else display_name end, updated_at = now() where id = r.id;
  end loop;
end $fix$;

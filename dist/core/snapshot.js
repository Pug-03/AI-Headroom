/**
 * Provider-neutral data model. Every adapter converts its CLI's data into a
 * Snapshot; the core and renderers only ever see this shape.
 */

/** Where a limit value came from. Anything but "stdin"/"api" is shown as approximate. */
                                                               

                        
                                                                         
             
                                                  
                
                                                                         
                  
                                                          
                    
                      
 

                               
                                                                    
                      
                                                           
                      
 

                           
                   
                
                        
                  
                                                                 
               
 

export function clampPct(n        )         {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Context fill in percent, or null when it cannot be computed. */
export function contextPct(c              )                {
  if (c.used === null || c.size === null || c.size <= 0) return null;
  return clampPct((c.used * 100) / c.size);
}

/** Limit window id from its length in minutes. */
export function limitId(minutes                           )         {
  if (minutes === 300) return "5h";
  if (minutes === 10080) return "weekly";
  if (!minutes) return "limit";
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

export function limitLabel(id        )         {
  return id === "weekly" ? "Weekly" : id === "limit" ? "Limit" : id;
}

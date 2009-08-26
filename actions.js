

// Takes a function to decide on the insert point, but this is not very compatible with my event model
// since events have to be normalized to strings, and the function will include a dom pointer.  How sad.
// TODO: refactor this into two forms, making use of shared code.

function create_sibling(item){
  var node = create_an_item(function(node){ item.after(node) })
  create_history_item({type:'create_sibling', item:node.attr('data-id'), prev:item.attr('data-id')})
}

var auto_increment = 0
function create_an_item(insert){
  var node = $('.item.prototype').clone().removeClass('prototype').attr('data-id',auto_increment)
  auto_increment += 1
  insert(node)
  $(':focus').blur()
  node.find('.note').keydown(note_keydown).autogrow({extraSpace:100}).blur(changed_text).keydown(change_countdown)
  node.find('.title').keydown(title_keydown).focus().blur(changed_text).keydown(change_countdown)  
  return node
}


var time_until_autosave = 5000
var change_countdown_timer
function change_countdown(event){
  clearTimeout(change_countdown_timer)
  change_countdown_timer = setTimeout(faniggle_text, time_until_autosave)
}

// Move current item to be the last child of its previous sibling
function indent(item){
  var prev = item.prev()
  if (prev.length && !prev.hasClass('folded')){
    item.appendTo(prev.find('.contents:first'))
    focus_item(item)
    create_history_item({type:'indent', item:item.attr('data-id')})
  }
}

// Move current item to be the last sibling of its parent
function dedent(item){
  var parent = item.parents('.item:first')
  if (parent.length){
    parent.after(item)
    focus_item(item)
    create_history_item({type:'dedent', item:item.attr('data-id')})
  }
}

// Focus the item that is vertically above the current item
// perhaps it should be called focus_up?  nah
function focus_prev(item){
  var prev = item.prev('.item:first') // find prev sibling
  if (prev.length) {
    while (true){
      if (prev.hasClass('folded')) break
      var child = prev.find('.contents:first > .item:last')
      if (!child.length) break // give up
      prev = child
    }
    // // oh crap, still folding issues here.
    // var child = prev.find('.item:last') // prefer sibling's last x-child
    // if (child.length && !prev.hasClass('folded')) prev = child
  }
  if (!prev.length){
    prev = item.parents('.item:first') // settle for own parent
  }
  return focus_item(prev)
}

// Focus the item that is vertically below the current item
function focus_next(item){
  var next
  if (!item.hasClass('.folded')) next = item.find('.item:first') // prefer first child
  if (!next || !next.length) next = item.next() // settle for next sibling
  if (!next.length) { // settle for x-parent's next sibling
    next = item
    while (true){
      next = next.parents('.item:first')
      if (!next.length) break // no solution
      var neighbor = next.next()
      if (neighbor.length){
        next = neighbor // found it
        break
      }
    }
  }
  return focus_item(next)    
}

// Move this item before its previous sibling  
function move_up(item){
  var prev = item.prev()
  if (prev.length) prev.before(item)
  // else { // re-parent?  Is this useful?
  //   
  // }
  focus_item(item)
  create_history_item({type:'move_up', item:item.attr('data-id')})
}

// Move this item after its next sibling
function move_down(item){
  item.next().after(item)
  focus_item(item)
  create_history_item({type:'move_down', item:item.attr('data-id')})
}

// Delete a node and all sub-nodes, moving them to purgatory so they can be resurrected later
function delete_tree(item){
  history_data = {type:'delete_tree', item:item.attr('data-id')}
  
  // find something else to look at
  focus_prev(item).length || focus_item(item.next()).length

  // remember where this node was atached
  var prev = item.prev()
  if (!prev.length) {
    var parent = item.parents('.contents:first')
    history_data['parent'] = parent.attr('data-id')
  } else {
    history_data['prev'] = prev.attr('data-id')
  }
    
  // save in purgatory for later ressuraction
  item.prependTo($('.dead'))

  // if there are no nodes left, create a new one as part of this same event.
  if(!$('.root .item').length) {
    var node = create_an_item(function(node){ $('.root').prepend(node) })
    history_data['new_item_id'] = node.attr('data-id')
  }
  
  create_history_item(history_data)
}

// Moves a node to purgatory, but makes all of its children into children of its parent
// This one doesn't have a redo action yet because it is rather mutative.  I'd need to list the
// nodes that got reparented so that all of them could be parented back.
// function delete_reparent(item){
//   var children = item.find('.contents:first > .item')
//   var parent = item.parents('.item:first')
//   if (parent.length){
//     parent.find('.contents:first').append(children)
//     item.remove()
//     focus_item(parent)
//     events.push({type:'delete_reparent', item:item.attr('data-id')})
//   }
// }

// Hides and deactivates child nodes
function fold(item){
  item.addClass('folded')
  create_history_item({type:'fold', item:item.attr('data-id')})    
}

// Shows and activates child nodes
function unfold(item){
  item.removeClass('folded')
  create_history_item({type:'unfold', item:item.attr('data-id')})    
}

function toggle_fold_item(item){
  if (item.find('.item').length){
    if (item.hasClass('folded'))  unfold(item)
    else                          fold(item)
  }
}

// Reverse last action but remember it so it can be re-done later
// May invoke a text changed event before acting
function undo(){
  faniggle_text()
  
  reverse_mode = true
  if (events.length) {
    var event = events.pop()
    reverse_event(event)
    undone_events.push(events.pop())
  }
  reverse_mode = false
}

// Reverses actions again that were previously reversed, hence returning to normal
function redo(){
  if (undone_events.length) {
    var event = undone_events.pop()
    reverse_event(event)
  }
}

// Find an item the way it is described in text-based event history
function find_item(id){ return $('[data-id='+id+']') }

function init_empty(){
  create_an_item(function(node){ node.appendTo('.root') })
  // create_history_item({type:'base_item'})
  // events.pop()
}

// These really need some better names
var events = []
var undone_events = []
var history_event = false
var replay_mode = false
var reverse_mode = false

// Add an event to the undo/redo history, as well as the persistence layer
// Should we make use of the persistence layer for event history directly?  I mean..
// We are duplicating information here after all.
function create_history_item(data){
  events.push(data)
  
  if (!history_event) undone_events = []

  if (storage_method == "localStorage"){
    var event_count = parseInt(localStorage.event_count)
    if (reverse_mode) {
      localStorage.removeItem('event-'+(event_count-1))
      localStorage.event_count = event_count -1
      console.debug('undid:',event_count)
    }
    else if (!replay_mode){
      localStorage['event-'+event_count] = $.toJSON(data)
      localStorage.event_count = event_count +1
      console.debug('did:',event_count)
    }
  }
  
  // $('.output').text(data.toSource())
  // Doing real events destroys undone events. How sad.
}

// How to re-play events from hard storage
var forward_events = {
  create_sibling: function(data) { 
    var prev = find_item(data.prev)
    create_sibling(prev)
  },
  indent:     function(data){ indent      (find_item(data.item)) },
  dedent:     function(data){ dedent      (find_item(data.item)) },
  move_up:    function(data){ move_up     (find_item(data.item)) },
  move_down:  function(data){ move_down   (find_item(data.item)) },
  fold:       function(data){ fold        (find_item(data.item)) },
  unfold:     function(data){ unfold      (find_item(data.item)) },
  delete_tree:function(data){ delete_tree (find_item(data.item)) },
  change:     function(data){
    var item = find_item(data.item)
    var field = item.find('.'+data.field+':first')
    field.val(data.new_text)
    field.attr('data-text', data.new_text)
    field.focus()
    create_history_item({type:'change', item:data.item, field:data.field, old_text:data.old_text, new_text:data.new_text})
  }    
}

// How to reverse events that were carried out in this session, including those
// replayed from storage.
var reverse_events = {
  create_sibling: function(data){ delete_tree (find_item(data.item)) },
  indent:     function(data){ dedent      (find_item(data.item)) },
  dedent:     function(data){ indent      (find_item(data.item)) },
  move_up:    function(data){ move_down   (find_item(data.item)) },
  move_down:  function(data){ move_up     (find_item(data.item)) },
  fold:       function(data){ unfold      (find_item(data.item)) },
  unfold:     function(data){ fold        (find_item(data.item)) },
  delete_tree:function(data){
    // restore an item from purgatory to its original place
    var item = find_item(data.item)
    var prev = find_item(data.prev)
    var parent = find_item(data.parent)
    if (prev.length) prev.after(item)
    else if (parent.length) {
      parent.prepend(item)
      console.debug("local")
    } else {
      console.debug(item.get(), $('.root').get())
      $('.root').prepend(item)
    }
    focus_item(item)

    // if we created a new item to replace it, get rid of that now
    if (data.new_item_id){
      var new_item = find_item(data.new_item_id)
      new_item.remove()
    }
    
    create_history_item({type:'create_sibling', item:data.item})
  },
  delete_rebase:function(data){
    
  },
  delete_reparent:function(data){
    // damn, this one might be difficult
  },
  change: function(data){
    var item = find_item(data.item)
    var field = item.find('.'+data.field+':first')
    field.val(data.old_text)
    field.attr('data-text', data.old_text)
    field.focus()
    create_history_item({type:'change', item:data.item, field:data.field, old_text:data.new_text, new_text:data.old_text})
  },
  base_item: function(data){
    // if (events.length > 1) {
    //   var base_node_event = events.pop()
    //   var delete_event = events.pop()
    //   // reverse deletion first so we we'll have some content and wont automatically create another seed node
    //   reverse_event(delete_event)
    //   var reversed_delete = events.pop()
    //   reverse_event(base_node_event)
    //   var reversed_base = events.pop()
    //   console.debug('reversed_delete', reversed_delete, reversed_delete.item.get())
    //   console.debug('reversed_base', reversed_base, reversed_base.item.get())
    //   console.debug('shuffled',events)
    //   events.push(reversed_delete)
    //   // events.pop()
    //   // console.debug('popped',undone_events.pop()) // the base node should not be recorded        
    // }
  }
}

// When in history mode, you don't invalidate the undone events history by generating an event
function reverse_event(event){
  history_event = true
  reverse_events[event.type](event)
  history_event = false    
}

function read_persistent_data(){
  if (typeof localStorage != 'undefined'){
    storage_method = "localStorage"
  
    if (localStorage.event_count) {
      replay_mode = true
      var event_count = parseInt(localStorage.event_count)
      for (var x = 0; x < event_count; x++){
        var raw_event = localStorage["event-"+x]
        var event = $.evalJSON(raw_event)
        forward_events[event.type](event)
        // console.debug(localStorage["event-"+x])
      }
      replay_mode = false
    } else {
      localStorage.event_count = 0
    }
  }
}
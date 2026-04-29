if (!window.SwymCallbacks) {
	window.SwymCallbacks = [];
};

const header_icon = document.querySelector('.Header__Icon.swym-wishlist');
let primary_list,
	primary_list_count = 0;

function updateHeader(count) {
	if (count > 0) {
		header_icon.classList.add('swym-added');
	} else {
		header_icon.classList.remove('swym-added');
	}
}

function fetchListCallbackFn(lists) {	
	if (lists.length) {
		primary_list = lists[0];
		primary_list_count = primary_list.cnt;
		updateHeader(primary_list.cnt);
	}
}

function swymCallbackFn(swat) {
	swat.fetchLists({
		callbackFn: fetchListCallbackFn
	});

	swat.evtLayer.addEventListener('sw:addedtowishlist', function(event){
		primary_list_count = primary_list_count + 1;
		updateHeader(primary_list_count)
	});

	swat.evtLayer.addEventListener('sw:removedfromwishlist', function(event){
		primary_list_count = primary_list_count - 1;
		updateHeader(primary_list_count)
	});
}

window.SwymCallbacks.push(swymCallbackFn);
